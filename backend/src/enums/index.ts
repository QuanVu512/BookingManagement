/**
 * Centralized Enums Export
 * Gom toàn bộ Domain Enums từ Prisma Schema và Application Enums của hệ thống.
 */

// Application Enums
export {
  ApiStatus,
  AppErrorCode,
  SortOrder,
  CourtSlotAvailability,
} from './app.enum.js';

// Domain Enums (Generated từ Prisma Schema)
export {
  UserStatus,
  Role,
  CourtType,
  CourtStatus,
  BookingSource,
  BookingStatus,
  CancellationRule,
  OccupancyKind,
  OccupancyState,
  ActorType,
  BookingTokenPurpose,
  CheckinMethod,
  CancellationRequestStatus,
  PaymentReferenceType,
  PaymentPurpose,
  PaymentMethod,
  ReceiptMethod,
  ReceiptVerificationStatus,
  ReceiptAllocationStatus,
  ConfirmationSource,
  WebhookKind,
  WebhookStatus,
  RefundReasonType,
  RefundMethod,
  RefundStatus,
  ApprovalSource,
  RefundAttemptStatus,
  NotificationTemplate,
  NotificationStatus,
  PaymentRequestStatus,
} from '../generated/prisma/enums.js';
