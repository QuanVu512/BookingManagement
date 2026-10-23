/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import config from '../data/court-booking.json';
import type { CourtItem } from '../types/auth';
import type {
  BookingAction,
  BookingSelection,
  BookingOrder,
  BookingOrderLine,
  CourtTimeSlot,
} from '../types/court-booking';

const currency = new Intl.NumberFormat('vi-VN');
export const BOOKING_CONFIG = config;
export const BOOKING_PERIODS = [
  { id: 'morning', label: 'Ca sáng · 06:00 – 12:00' },
  { id: 'evening', label: 'Ca tối · Giờ vàng · 17:00 – 22:00' },
];

export function formatMoney(amount: number): string {
  return `${currency.format(amount)}đ`;
}

export function getLocalDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}

export { formatBookingDate } from '../features/booking/model/booking-time';

export function createBookingSelection(date: string): BookingSelection {
  return {
    date,
    slotIds: [config.defaultSlotId],
    quantities: {},
    voucherInput: '',
    appliedVoucher: '',
    voucherMessage: '',
    checkoutMessage: '',
  };
}

export function getSlotPrice(court: CourtItem, slot: CourtTimeSlot): number {
  const primePrices: Record<string, number> = config.primePrices;
  return slot.isPrime
    ? (primePrices[court.code] ?? court.pricePerHour)
    : court.pricePerHour;
}

export function toggleBookingSlot(
  selection: BookingSelection,
  slotId: string,
): BookingSelection {
  const slot = config.slots.find((item) => item.id === slotId);
  if (!slot || slot.isBooked) return selection;
  const slotIds = selection.slotIds.includes(slotId)
    ? selection.slotIds.filter((id) => id !== slotId)
    : [...selection.slotIds, slotId];
  return { ...selection, slotIds, checkoutMessage: '' };
}

export function changeAddonQuantity(
  selection: BookingSelection,
  productId: string,
  delta: number,
): BookingSelection {
  if (!config.products.some((product) => product.id === productId))
    return selection;
  const quantity = Math.min(
    config.maximumQuantity,
    Math.max(0, (selection.quantities[productId] ?? 0) + delta),
  );
  return {
    ...selection,
    quantities: { ...selection.quantities, [productId]: quantity },
    checkoutMessage: '',
  };
}

export function applyBookingVoucher(
  selection: BookingSelection,
): BookingSelection {
  const code = selection.voucherInput.trim().toUpperCase();
  const isValid = code === config.voucherCode;
  return {
    ...selection,
    appliedVoucher: isValid ? code : '',
    checkoutMessage: '',
    voucherMessage: isValid
      ? 'Đã áp dụng giảm 10% tiền sân.'
      : 'Mã không hợp lệ. Hãy thử PICKLEPASS10.',
  };
}

function getOrderLines(selection: BookingSelection): BookingOrderLine[] {
  return config.products
    .filter((product) => (selection.quantities[product.id] ?? 0) > 0)
    .map((product) => ({
      product,
      quantity: selection.quantities[product.id],
      total: product.price * selection.quantities[product.id],
    }));
}

export function calculateBookingOrder(
  court: CourtItem,
  selection: BookingSelection,
): BookingOrder {
  const slots = config.slots.filter(
    (slot) => !slot.isBooked && selection.slotIds.includes(slot.id),
  );
  const lines = getOrderLines(selection);
  const courtTotal = slots.reduce(
    (total, slot) => total + getSlotPrice(court, slot),
    0,
  );
  const addonTotal = lines.reduce((total, line) => total + line.total, 0);
  const discount =
    selection.appliedVoucher === config.voucherCode
      ? Math.round(courtTotal * config.voucherRate)
      : 0;
  return {
    slots,
    lines,
    courtTotal,
    addonTotal,
    discount,
    total: courtTotal + addonTotal - discount,
    itemCount:
      slots.length + lines.reduce((total, line) => total + line.quantity, 0),
  };
}

export function getCheckoutMessage(order: BookingOrder): string {
  return order.slots.length
    ? `Đơn demo ${formatMoney(order.total)} đã sẵn sàng. Chưa thu tiền hoặc giữ sân thực tế.`
    : 'Vui lòng chọn ít nhất một khung giờ thi đấu.';
}

export function changeBookingDate(
  selection: BookingSelection,
  date: string,
): BookingSelection {
  return date
    ? { ...selection, date, slotIds: [], checkoutMessage: '' }
    : selection;
}

export function changeVoucherInput(
  selection: BookingSelection,
  voucherInput: string,
): BookingSelection {
  return {
    ...selection,
    voucherInput,
    appliedVoucher: '',
    voucherMessage: '',
    checkoutMessage: '',
  };
}

export function reduceBookingSelection(
  selection: BookingSelection,
  action: BookingAction,
): BookingSelection {
  switch (action.type) {
    case 'date':
      return changeBookingDate(selection, action.date);
    case 'slot':
      return toggleBookingSlot(selection, action.slotId);
    case 'quantity':
      return changeAddonQuantity(selection, action.productId, action.delta);
    case 'voucher-input':
      return changeVoucherInput(selection, action.value);
    case 'voucher-apply':
      return applyBookingVoucher(selection);
    case 'checkout':
      return {
        ...selection,
        checkoutMessage: getCheckoutMessage(
          calculateBookingOrder(action.court, selection),
        ),
      };
  }
}

export function getSlotCaption(
  slot: CourtTimeSlot,
  isSelected: boolean,
): string {
  if (slot.isBooked) return 'Không khả dụng';
  if (isSelected) return 'Đã chọn';
  return slot.isPrime ? 'Giờ vàng' : '1 giờ thi đấu';
}
