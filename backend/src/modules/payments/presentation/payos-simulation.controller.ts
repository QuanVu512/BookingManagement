import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SimulateDemoPaymentUseCase } from '../application/simulate-demo-payment.use-case.js';
import { DemoPaymentAccessGuard } from '../infrastructure/demo-payment-access.guard.js';
import { SimulatePayosWebhookDto } from './dto/simulate-payos-webhook.dto.js';

@Controller('api/webhooks/payos')
@UseGuards(DemoPaymentAccessGuard)
export class PayosSimulationController {
  constructor(private readonly simulate: SimulateDemoPaymentUseCase) {}

  @Post('simulate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  async execute(
    @Req()
    request: Request & { guestBookingId?: string; user?: { userId: string } },
    @Body() body: SimulatePayosWebhookDto,
  ) {
    if (!body.requestId && body.orderCode === undefined) {
      throw new BadRequestException('Cần requestId hoặc orderCode.');
    }
    const subject = {
      userId: request.guestBookingId ? null : (request.user?.userId ?? null),
      guestBookingId: request.guestBookingId,
    };
    const data = body.requestId
      ? await this.simulate.execute(body.requestId, subject)
      : await this.simulate.executeForOrderCode(body.orderCode!, subject);
    return { success: true, data };
  }
}
