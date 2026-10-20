import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PayosWebhookInbox } from '../infrastructure/payos-webhook-inbox.js';

/**
 * BE-PAY-09 — Webhook receiver E23 (MIG-06, MIG-12).
 * Public route: HMAC checksum chính là auth. KHÔNG gắn JwtAuthGuard —
 * staff JWT không thay thế chữ ký provider (MIG-13 bootstrap check).
 * HMAC verify trước dedup; sai → 400, không business effect.
 */
@Controller('api/webhooks/payos')
export class PayosWebhookController {
  constructor(private readonly inbox: PayosWebhookInbox) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E23: nhận webhook payOS (durable inbox)' })
  async receive(@Body() envelope: unknown) {
    try {
      const result = await this.inbox.ingest(envelope);
      return { success: true, data: result };
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Webhook không hợp lệ.',
      );
    }
  }
}
