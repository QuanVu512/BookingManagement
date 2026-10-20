import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';

/**
 * BE-PAY-17 — Payment audit logger (append-only).
 * Chỉ INSERT + SELECT; không UPDATE/DELETE từ app. IP lưu dạng SHA-256,
 * detail không chứa secret/token/raw account.
 */
export type AuditActor = 'SYSTEM' | 'CUSTOMER' | 'GUEST' | 'STAFF';

export interface AuditEntry {
  actorType: AuditActor;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  bookingId?: string | null;
  ip?: string | null;
  result: 'OK' | 'DENIED' | 'FAILED';
  detail?: Record<string, unknown>;
}

@Injectable()
export class PaymentAuditLogger {
  constructor(private readonly prisma: PrismaService) {}

  private row(entry: AuditEntry) {
    return {
      actorType: entry.actorType,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      bookingId: entry.bookingId ?? null,
      ipHash: entry.ip
        ? createHash('sha256').update(entry.ip).digest('hex')
        : null,
      result: entry.result,
      detail: (entry.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  }

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.paymentAuditLog.create({ data: this.row(entry) });
  }

  async logInTransaction(
    transaction: TransactionContext,
    entry: AuditEntry,
  ): Promise<void> {
    await transaction.paymentAuditLog.create({ data: this.row(entry) });
  }
}
