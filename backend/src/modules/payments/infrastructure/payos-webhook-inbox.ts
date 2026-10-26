import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  PayosSignatureService,
  type VerifiedWebhookData,
} from './payos-signature.service.js';

/**
 * BE-PAY-09 — Webhook inbox E23 (MIG-06, MIG-07).
 * - HMAC verify TRƯỚC dedup; signature sai → 400, không lưu business effect.
 * - Deduplication key = canonical business identity (channel + reference),
 *   KHÔNG hash toàn payload / UUID delivery (MIG-06).
 * - Claim trả generation qua attemptCount tăng atomically; finalize CAS
 *   id + PROCESSING + generation để worker cũ không ghi đè (MIG-07).
 * - Scanner phải xử lý RECEIVED, FAILED đến hạn và PROCESSING hết lease —
 *   phần quét chạy ở worker (BE-PAY-16), inbox ở đây expose claim/finalize.
 */
export interface WebhookIngestResult {
  eventId: string;
  status: 'RECEIVED' | 'DUPLICATE';
  deduplicationKey: string | null;
}

const PROCESSING_LEASE_MS = 60_000;

@Injectable()
export class PayosWebhookInbox {
  private readonly logger = new Logger(PayosWebhookInbox.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: PayosSignatureService,
    private readonly config: ConfigService,
  ) {}

  channelId(): string {
    return this.config.get<string>('PAYOS_CHANNEL_ID') ?? 'PAYOS';
  }

  async ingest(envelope: unknown): Promise<WebhookIngestResult> {
    // MIG-06: verify trước mọi thao tác dedup/persist business.
    const data = await this.signatures.verifyEnvelope(envelope);
    const channelId = this.channelId();
    const deduplicationKey = this.deduplicationKeyFor(channelId, data);

    const existing = deduplicationKey
      ? await this.prisma.paymentWebhookEvent.findFirst({
          where: { deduplicationKey },
          select: { id: true },
        })
      : null;
    if (existing) {
      return {
        eventId: existing.id,
        status: 'DUPLICATE',
        deduplicationKey,
      };
    }

    const created = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider: 'PAYOS',
        providerChannelId: channelId,
        eventKind: 'PAYMENT',
        providerReference: this.providerReferenceOf(data),
        deduplicationKey,
        signatureValid: true,
        payload: this.redactedPayload(envelope) as Prisma.InputJsonValue,
        status: 'RECEIVED',
      },
      select: { id: true },
    }).catch((error: unknown) => {
      // BLK concurrent ingest: unique dedup thắng — trả DUPLICATE thay 500.
      const code =
        typeof error === 'object' && error !== null
          ? String((error as { code?: string }).code ?? '')
          : '';
      if (code === 'P2002') {
        return null;
      }
      throw error;
    });
    if (!created) {
      const existingAfter =
        deduplicationKey
          ? await this.prisma.paymentWebhookEvent.findFirst({
              where: { deduplicationKey },
              select: { id: true },
            })
          : null;
      return {
        eventId: existingAfter?.id ?? 'unknown',
        status: 'DUPLICATE',
        deduplicationKey,
      };
    }
    return {
      eventId: created.id,
      status: 'RECEIVED',
      deduplicationKey,
    };
  }

  /**
   * Claim event để xử lý. Trả generation = attemptCount sau tăng;
   * worker chỉ finalize khi (id, PROCESSING, generation) còn khớp.
   */
  async claim(eventId: string): Promise<{ generation: number } | null> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + PROCESSING_LEASE_MS);
    const result = await this.prisma.$queryRaw<{ attempt_count: number }[]>`
      UPDATE payment_webhook_events
      SET status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        next_retry_at = ${leaseUntil}
      WHERE id = ${eventId}::uuid
        AND (
          status = 'RECEIVED'
          OR (status = 'FAILED' AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp()))
          OR (status = 'PROCESSING' AND next_retry_at IS NOT NULL AND next_retry_at <= clock_timestamp())
        )
      RETURNING attempt_count`;
    if (result.length === 0) return null;
    return { generation: result[0].attempt_count };
  }

  async finalize(
    eventId: string,
    generation: number,
    outcome: 'PROCESSED' | 'FAILED' | 'IGNORED',
    lastError?: string,
  ): Promise<boolean> {
    const result = await this.prisma.$executeRaw`
      UPDATE payment_webhook_events
      SET status = ${outcome}::webhook_status,
        last_error = ${lastError ?? null},
        processed_at = CASE WHEN ${outcome} = 'PROCESSED' THEN clock_timestamp() ELSE processed_at END,
        next_retry_at = CASE
          WHEN ${outcome} = 'FAILED' THEN clock_timestamp() + make_interval(secs => 60)
          ELSE NULL END
      WHERE id = ${eventId}::uuid
        AND status = 'PROCESSING'
        AND attempt_count = ${generation}`;
    return result === 1;
  }

  deduplicationKeyFor(
    channelId: string,
    data: VerifiedWebhookData,
  ): string | null {
    const reference = this.providerReferenceOf(data);
    if (!reference) return null;
    return `${channelId}::PAYMENT::${reference.trim().toUpperCase()}`;
  }

  private providerReferenceOf(data: VerifiedWebhookData): string | null {
    const candidates = [
      data.reference,
      typeof data.description === 'string' ? this.parseOrderFromDescription(data.description) : null,
    ];
    for (const candidate of candidates) {
      if (candidate && candidate.trim().length > 0) return candidate.trim();
    }
    return null;
  }

  private parseOrderFromDescription(description: string): string | null {
    const match = /PAY-([A-Z0-9]{8,32})/i.exec(description);
    return match ? match[0].toUpperCase() : null;
  }

  /** Redact signature/checksum trước khi persist payload (MIG-17). */
  private redactedPayload(envelope: unknown): Record<string, unknown> {
    if (typeof envelope !== 'object' || envelope === null) return {};
    const { signature: _signature, ...rest } = envelope as Record<string, unknown>;
    void _signature;
    const data =
      typeof rest.data === 'object' && rest.data !== null
        ? { ...(rest.data as Record<string, unknown>) }
        : rest.data;
    if (typeof data === 'object' && data !== null) {
      delete (data as Record<string, unknown>).checksum;
      delete (data as Record<string, unknown>).signature;
    }
    return { ...rest, data };
  }
}
