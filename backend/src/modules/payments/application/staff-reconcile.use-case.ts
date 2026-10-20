import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';
import { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';

/**
 * E15 — Staff reconcile payment request (MANAGER ở controller).
 * Gọi provider getPaymentLink NGOÀI tx; chỉ cập nhật mốc thời gian local
 * (không đổi transition đã chốt); persist diff kèm audit. Tiền/status mới
 * (nếu có) đi qua canonical receipt path — ở đây không tự credit.
 */
@Injectable()
export class StaffReconcileUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PayosGatewayAdapter,
    private readonly audit: PaymentAuditLogger,
  ) {}

  async execute(input: {
    requestId: string;
    actorUserId: string;
    ip?: string;
  }) {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id: input.requestId },
    });
    if (!request) throw new BadRequestException('PAYMENT_REQUEST_NOT_FOUND');
    if (!request.providerPaymentLinkId || !this.gateway.isConfigured()) {
      throw new BadRequestException({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Không có link provider để đối soát.',
      });
    }
    let providerStatus: string;
    let providerPaid = 0;
    try {
      const link = await this.gateway.getLink(request.providerPaymentLinkId);
      providerStatus = link.status;
      providerPaid = link.amountPaid ?? 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      const code = /timeout/i.test(message) ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE';
      throw new BadRequestException({ code, message: 'Provider tạm không khả dụng.' });
    }
    const diff = {
      providerStatus,
      localStatus: String(request.status),
      providerPaid,
      localAmount: Number(request.amount.toString()),
    };
    // Không đổi transition đã chốt; diff được persist trong audit log.
    // Tiền/status mới (nếu có) phải đi qua canonical receipt path
    // (webhook/terminal-watch), không credit tại đây.
    await this.audit.log({
      actorType: 'STAFF',
      actorUserId: input.actorUserId,
      action: 'reconcile',
      entityType: 'payment_request',
      entityId: request.id,
      bookingId: request.referenceId,
      ip: input.ip,
      result: 'OK',
      detail: diff,
    });
    return { ...diff, requestId: request.id };
  }
}
