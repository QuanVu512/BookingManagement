import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * BE-PAY-01 — Mã lỗi payment có cấu trúc (MIG-10, MIG-12).
 * FE phân biệt retryable / CSRF / RBAC / stale-quote qua errorCode.
 */
export type PaymentErrorCode =
  | 'PAYMENT_VALIDATION'
  | 'PAYMENT_IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_QUOTE_STALE'
  | 'PAYMENT_HOLD_EXPIRED'
  | 'PAYMENT_NOT_ELIGIBLE'
  | 'PAYMENT_WEBHOOK_SIGNATURE'
  | 'PAYMENT_RECEIPT_CONFLICT'
  | 'PAYMENT_FORBIDDEN'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_UNAVAILABLE';

export function paymentError(
  code: PaymentErrorCode,
  message: string,
): HttpException {
  switch (code) {
    case 'PAYMENT_IDEMPOTENCY_CONFLICT':
      return new ConflictException({ code, message });
    case 'PAYMENT_QUOTE_STALE':
      return new ConflictException({ code, message });
    case 'PAYMENT_HOLD_EXPIRED':
      return new GoneException({ code, message });
    case 'PAYMENT_NOT_ELIGIBLE':
      return new BadRequestException({ code, message });
    case 'PAYMENT_VALIDATION':
      return new BadRequestException({ code, message });
    case 'PAYMENT_WEBHOOK_SIGNATURE':
      return new BadRequestException({ code, message });
    case 'PAYMENT_RECEIPT_CONFLICT':
      return new ConflictException({ code, message });
    case 'PAYMENT_FORBIDDEN':
      return new ForbiddenException({ code, message });
    case 'PAYMENT_NOT_FOUND':
      return new NotFoundException({ code, message });
    case 'PAYMENT_UNAVAILABLE':
      return new ServiceUnavailableException({ code, message });
  }
}
