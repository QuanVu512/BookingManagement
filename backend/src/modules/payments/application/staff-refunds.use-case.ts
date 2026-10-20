import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS, PAYOUT_ENABLED } from '../payment.constants.js';
import { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';
import { RefundDestinationCrypto } from '../infrastructure/refund-destination-crypto.js';
import { RefundOrchestration } from './refund-orchestration.js';

const LIVE_ATTEMPT = ['CREATED', 'SUBMITTED', 'PROCESSING', 'UNKNOWN'];
const CLOSED_REFUND = ['COMPLETED', 'REJECTED', 'CANCELLED'];

/**
 * Staff refund operations: E17 list, E18 approve, E19 reject, E21 reveal,
 * E22 reconcile-manual (MIG-04, MIG-16).
 * - Four-eyes E18: approver ≠ requester (requester null/system → manager bất kỳ).
 * - E19: chặn khi attempt live; reason bắt buộc.
 * - E21: decrypt khi có + audit; last4-only khi chưa có key (OD-12).
 * - E22 manual: finalize UNKNOWN theo evidence staff; payout flag OFF → 422.
 */
@Injectable()
export class StaffRefundsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PaymentAuditLogger,
    private readonly crypto: RefundDestinationCrypto,
    private readonly orchestration: RefundOrchestration,
  ) {}

  /** E17: list refunds (MANAGER/ADMIN ở controller), masked. */
  async list(input: { status?: string; bookingId?: string }) {
    const refunds = await this.prisma.refundRequest.findMany({
      where: {
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.bookingId
          ? {
              paymentTransaction: {
                paymentRequest: { referenceId: input.bookingId },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        attempts: { orderBy: { attemptNumber: 'desc' } },
        paymentTransaction: {
          select: { id: true, paymentRequest: { select: { referenceId: true } } },
        },
      },
    });
    return {
      items: refunds.map((refund) => ({
        id: refund.id,
        bookingId:
          refund.paymentTransaction?.paymentRequest?.referenceId ?? '',
        bookingCode: '',
        amount: Number(refund.amount.toString()),
        currency: refund.currency,
        reason: String(refund.reasonType),
        method: String(refund.method),
        status: String(refund.status),
        destinationAccountLast4: refund.destinationAccountLast4 ?? '',
        destinationAccountName: refund.destinationAccountName,
        attempts: refund.attempts.map((attempt) => ({
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          method: String(attempt.method),
          status: String(attempt.status),
          referenceId: attempt.referenceId,
          bankTransactionReference: attempt.bankTransactionReference,
          submittedAt: attempt.submittedAt?.toISOString(),
          completedAt: attempt.completedAt?.toISOString(),
        })),
        requestedByUserId: refund.requestedByUserId,
        approvedByUserId: refund.approvedByUserId,
        rejectionReason: refund.rejectionReason ?? undefined,
        createdAt: refund.createdAt.toISOString(),
        updatedAt: refund.updatedAt.toISOString(),
      })),
    };
  }

  /** E18: approve CAS REQUESTED→APPROVED + four-eyes + thu destination. */
  async approve(input: {
    refundId: string;
    note?: string;
    idempotencyKey: string;
    approverUserId: string;
    destination?: {
      bankBin: string;
      accountLast4: string;
      accountName: string;
      accountNumber?: string;
    };
    ip?: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const refund = await transaction.refundRequest.findUnique({
        where: { id: input.refundId },
      });
      if (!refund) throw new BadRequestException('REFUND_NOT_FOUND');
      if (CLOSED_REFUND.includes(String(refund.status))) {
        throw new ConflictException({
          code: 'REFUND_ALREADY_CLOSED',
          message: 'Refund đã đóng.',
        });
      }
      if (String(refund.status) !== 'REQUESTED') {
        throw new ConflictException({
          code: 'REFUND_ALREADY_CLOSED',
          message: 'Refund không ở trạng thái chờ duyệt.',
        });
      }
      if (
        refund.requestedByUserId !== null &&
        refund.requestedByUserId === input.approverUserId
      ) {
        await this.audit.logInTransaction(transaction, {
          actorType: 'STAFF',
          actorUserId: input.approverUserId,
          action: 'approve',
          entityType: 'refund_request',
          entityId: refund.id,
          result: 'DENIED',
          detail: { reason: 'SELF_APPROVAL' },
        });
        throw new ForbiddenException({
          code: 'SELF_APPROVAL_FORBIDDEN',
          message: 'Người yêu cầu không được tự duyệt.',
        });
      }
      // Thu destination ở approval (MIG-16); full number chỉ persist khi có key.
      let encrypted: Uint8Array<ArrayBuffer> | undefined;
      if (input.destination?.accountNumber) {
        if (!this.crypto.isConfigured()) {
          throw new BadRequestException({
            code: 'ENCRYPTION_NOT_CONFIGURED',
            message: 'Chưa có key mã hóa destination — chỉ nhận last4.',
          });
        }
        encrypted = Uint8Array.from(
          this.crypto.encrypt(input.destination.accountNumber),
        ) as Uint8Array<ArrayBuffer>;
      }
      const now = new Date();
      await transaction.refundRequest.update({
        where: { id: refund.id, status: 'REQUESTED' },
        data: {
          status: 'APPROVED',
          approvedByUserId: input.approverUserId,
          approvalSource: 'MANAGER',
          approvedAt: now,
          ...(input.destination
            ? {
                destinationBankBin: input.destination.bankBin,
                destinationAccountLast4: input.destination.accountLast4,
                destinationAccountName: input.destination.accountName,
                destinationAccountEncrypted: encrypted,
              }
            : {}),
        },
      });
      await this.audit.logInTransaction(transaction, {
        actorType: 'STAFF',
        actorUserId: input.approverUserId,
        action: 'approve',
        entityType: 'refund_request',
        entityId: refund.id,
        ip: input.ip,
        result: 'OK',
        detail: { note: input.note ?? null },
      });
      return { id: refund.id, status: 'APPROVED' as const };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  /** E19: reject từ REQUESTED/APPROVED, chặn attempt live, reason bắt buộc. */
  async reject(input: {
    refundId: string;
    rejectionReason: string;
    idempotencyKey: string;
    actorUserId: string;
    ip?: string;
  }) {
    if (!input.rejectionReason || input.rejectionReason.trim().length < 4) {
      throw new BadRequestException('rejectionReason bắt buộc.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const refund = await transaction.refundRequest.findUnique({
        where: { id: input.refundId },
      });
      if (!refund) throw new BadRequestException('REFUND_NOT_FOUND');
      if (CLOSED_REFUND.includes(String(refund.status))) {
        throw new ConflictException({
          code: 'REFUND_ALREADY_CLOSED',
          message: 'Refund đã đóng.',
        });
      }
      const live = await transaction.refundAttempt.findFirst({
        where: {
          refundRequestId: refund.id,
          status: { in: LIVE_ATTEMPT as never[] },
        },
        select: { id: true },
      });
      if (live) {
        throw new ConflictException({
          code: 'REFUND_ATTEMPT_IN_FLIGHT',
          message: 'Đang có attempt chưa rõ kết quả — không reject.',
        });
      }
      await transaction.refundRequest.update({
        where: { id: refund.id },
        data: { status: 'REJECTED', rejectionReason: input.rejectionReason },
      });
      await this.audit.logInTransaction(transaction, {
        actorType: 'STAFF',
        actorUserId: input.actorUserId,
        action: 'reject',
        entityType: 'refund_request',
        entityId: refund.id,
        ip: input.ip,
        result: 'OK',
        detail: { rejectionReason: input.rejectionReason },
      });
      return { id: refund.id, status: 'REJECTED' as const };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  /** E21: reveal destination (MANAGER ở controller) + audit. */
  async reveal(input: {
    refundId: string;
    actorUserId: string;
    ip?: string;
  }) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: input.refundId },
    });
    if (!refund) throw new BadRequestException('REFUND_NOT_FOUND');
    let accountNumber: string | null = null;
    let encrypted = false;
    if (refund.destinationAccountEncrypted) {
      accountNumber = this.crypto.decrypt(refund.destinationAccountEncrypted);
      encrypted = true;
    }
    await this.audit.log({
      actorType: 'STAFF',
      actorUserId: input.actorUserId,
      action: 'reveal',
      entityType: 'refund_request',
      entityId: refund.id,
      ip: input.ip,
      result: 'OK',
      detail: { encrypted },
    });
    return {
      bankBin: refund.destinationBankBin,
      accountNumber,
      accountName: refund.destinationAccountName,
      accountLast4: refund.destinationAccountLast4,
      encrypted,
    };
  }

  /**
   * E22: reconcile manual — finalize UNKNOWN theo evidence staff cung cấp.
   * Payout path: flag OFF → 422 PAYOUT_NOT_ENABLED.
   */
  async reconcile(input: {
    refundId: string;
    bankTransactionReference?: string;
    evidenceReference?: string;
    actorUserId: string;
    ip?: string;
  }) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: input.refundId },
      include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
    });
    if (!refund) throw new BadRequestException('REFUND_NOT_FOUND');
    if (String(refund.method) === 'PAYOS_PAYOUT' || PAYOUT_ENABLED) {
      throw new BadRequestException({
        code: 'PAYOUT_NOT_ENABLED',
        message: 'Kênh payout chưa được bật.',
      });
    }
    const latest = refund.attempts[0];
    if (!latest || String(latest.status) !== 'UNKNOWN') {
      await this.audit.log({
        actorType: 'STAFF',
        actorUserId: input.actorUserId,
        action: 'reconcile',
        entityType: 'refund_request',
        entityId: refund.id,
        ip: input.ip,
        result: 'OK',
        detail: { outcome: 'NO_UNKNOWN_ATTEMPT' },
      });
      return { id: refund.id, status: String(refund.status), diff: null };
    }
    if (!input.bankTransactionReference || !input.evidenceReference) {
      return {
        id: refund.id,
        status: String(refund.status),
        diff: { needsEvidence: true },
      };
    }
    const completed = await this.orchestration.completeManualRefund({
      attemptId: latest.id,
      bankTransactionReference: input.bankTransactionReference,
      evidenceReference: input.evidenceReference,
      actorUserId: input.actorUserId,
    });
    await this.audit.log({
      actorType: 'STAFF',
      actorUserId: input.actorUserId,
      action: 'reconcile',
      entityType: 'refund_request',
      entityId: refund.id,
      ip: input.ip,
      result: 'OK',
      detail: { outcome: completed.status, attemptId: latest.id },
    });
    return {
      id: refund.id,
      status: completed.status === 'COMPLETED' ? 'COMPLETED' : String(refund.status),
      diff: { attemptId: latest.id, outcome: completed.status },
    };
  }
}
