import type {
  Availability,
  BookingRecord,
  PriceItem,
  ServiceProduct,
  BookingServiceLine,
  ServiceSelection,
} from '../model/booking';
import { MAX_SERVICE_QUANTITY } from '../model/booking';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
export function isPriceItem(value: unknown): value is PriceItem {
  return (
    isRecord(value) &&
    typeof value.startsAt === 'string' &&
    typeof value.endsAt === 'string' &&
    ['durationMinutes', 'pricePerHour', 'amount'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  );
}
export function isBooking(value: unknown): value is BookingRecord {
  return (
    isRecord(value) &&
    [
      'id',
      'bookingCode',
      'courtId',
      'courtName',
      'timezone',
      'startsAt',
      'endsAt',
      'holdExpiresAt',
      'currency',
    ].every((key) => typeof value[key] === 'string') &&
    typeof value.status === 'string' &&
    [
      'HOLDING',
      'EXPIRED',
      'CANCELLED',
      'CONFIRMED',
      'CHECKED_IN',
      'COMPLETED',
      'NO_SHOW',
    ].includes(value.status) &&
    typeof value.totalAmount === 'number' &&
    Number.isSafeInteger(value.totalAmount) &&
    value.totalAmount >= 0 &&
    validServiceBreakdown(value) &&
    Array.isArray(value.priceItems) &&
    value.priceItems.every(isPriceItem)
  );
}
export function isAvailability(value: unknown): value is Availability {
  return (
    isRecord(value) &&
    typeof value.available === 'boolean' &&
    (value.reason === null || typeof value.reason === 'string') &&
    ['timezone', 'serverNow', 'occupiedUntil', 'currency'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    typeof value.totalAmount === 'number' &&
    Number.isSafeInteger(value.totalAmount) &&
    value.totalAmount >= 0 &&
    validServiceBreakdown(value) &&
    typeof value.cleanupMinutes === 'number' &&
    Array.isArray(value.priceItems) &&
    value.priceItems.every(isPriceItem)
  );
}

export function parseAvailability(
  value: unknown,
  services: ServiceSelection[] = [],
): Availability {
  if (!isAvailability(value)) throw new Error('Báo giá không hợp lệ.');
  assertSelectedServices(value.serviceItems, services);
  return value;
}

export function parseBooking(
  value: unknown,
  services: ServiceSelection[] = [],
): BookingRecord {
  if (!isBooking(value))
    throw new Error('Booking chưa được xác nhận. Hãy thử lại cùng thông tin.');
  assertSelectedServices(value.serviceItems, services);
  return value;
}

export function parseCancelledBooking(value: unknown): BookingRecord {
  if (!isBooking(value))
    throw new Error('Chưa xác nhận được kết quả hủy. Hãy tải lại.');
  return value;
}

export function parseBookingPage(value: unknown) {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isBooking) ||
    !(value.nextCursor === null || typeof value.nextCursor === 'string')
  )
    throw new Error('Danh sách booking không hợp lệ.');
  return { data: value.data, nextCursor: value.nextCursor };
}

export function isServiceProduct(value: unknown): value is ServiceProduct {
  return (
    isRecord(value) &&
    ['id', 'code', 'name', 'unit'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['DRINK', 'BALL', 'PADDLE'].includes(String(value.kind)) &&
    ['SALE', 'HOURLY_RENTAL'].includes(String(value.billingMode)) &&
    (value.kind === 'PADDLE') === (value.billingMode === 'HOURLY_RENTAL') &&
    typeof value.unitPrice === 'number' &&
    Number.isSafeInteger(value.unitPrice) &&
    value.unitPrice > 0
  );
}

export function parseServiceProducts(value: unknown): ServiceProduct[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item: unknown) =>
        isServiceProduct(item) &&
        typeof item.availableQuantity === 'number' &&
        Number.isSafeInteger(item.availableQuantity) &&
        item.availableQuantity >= 0 &&
        (item.imageUrl === null ||
          (typeof item.imageUrl === 'string' &&
            /^\/products\/[\w.-]+$/.test(item.imageUrl))),
    ) ||
    new Set(value.map((item) => item.id)).size !== value.length
  )
    throw new Error('Danh mục dịch vụ không hợp lệ.');
  return value;
}

function isServiceLine(value: unknown): value is BookingServiceLine {
  return (
    isRecord(value) &&
    isServiceProduct({ ...value, id: value.productId }) &&
    typeof value.productId === 'string' &&
    typeof value.quantity === 'number' &&
    Number.isInteger(value.quantity) &&
    value.quantity >= 1 &&
    value.quantity <= MAX_SERVICE_QUANTITY &&
    typeof value.durationMinutes === 'number' &&
    Number.isInteger(value.durationMinutes) &&
    (value.billingMode === 'SALE'
      ? value.durationMinutes === 0
      : value.durationMinutes > 0) &&
    typeof value.amount === 'number' &&
    Number.isSafeInteger(value.amount) &&
    value.amount >= 0
  );
}

function validServiceBreakdown(value: Record<string, unknown>) {
  if (value.serviceItems === undefined) return true;
  if (
    !Array.isArray(value.serviceItems) ||
    !value.serviceItems.every(isServiceLine) ||
    new Set(value.serviceItems.map((item) => item.productId)).size !==
      value.serviceItems.length ||
    !Array.isArray(value.priceItems) ||
    !value.priceItems.every(isPriceItem)
  )
    return false;
  return (
    value.priceItems.reduce((sum, item) => sum + item.amount, 0) +
      value.serviceItems.reduce((sum, item) => sum + item.amount, 0) ===
    value.totalAmount
  );
}

function assertSelectedServices(
  lines: BookingServiceLine[] = [],
  services: ServiceSelection[] = [],
) {
  if (
    lines.length !== services.length ||
    services.some(
      (selected) =>
        !lines.some(
          (line) =>
            line.productId === selected.productId &&
            line.quantity === selected.quantity,
        ),
    )
  )
    throw new Error(
      'Dịch vụ trong đơn chưa khớp. Hãy kiểm tra lại giá và giữ nguyên yêu cầu khi thử lại.',
    );
}
