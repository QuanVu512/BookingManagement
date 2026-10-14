// Persistence entities are generated from schema.prisma, not API response DTOs.
// Run npm run prisma:generate before consuming these types.
export type {
  PaymentRequest as PaymentRequestEntity,
  PaymentTransaction as PaymentTransactionEntity,
  PaymentWebhookEvent as PaymentWebhookEventEntity,
  RefundRequest as RefundRequestEntity,
  RefundAttempt as RefundAttemptEntity,
} from '../../generated/prisma/client.js';
