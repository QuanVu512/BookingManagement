/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
'use client';

import { useReducer } from 'react';
import type { CourtItem } from '../types/auth';
import {
  calculateBookingOrder,
  createBookingSelection,
  reduceBookingSelection,
} from '../lib/court-booking';

export function useCourtBooking(court: CourtItem, initialDate: string) {
  const [selection, dispatch] = useReducer(
    reduceBookingSelection,
    initialDate,
    createBookingSelection,
  );
  return {
    court,
    selection,
    order: calculateBookingOrder(court, selection),
    onDateChange: (date: string) => dispatch({ type: 'date', date }),
    onSlotToggle: (slotId: string) => dispatch({ type: 'slot', slotId }),
    onQuantityChange: (productId: string, delta: number) =>
      dispatch({ type: 'quantity', productId, delta }),
    onVoucherInput: (value: string) =>
      dispatch({ type: 'voucher-input', value }),
    onVoucherApply: () => dispatch({ type: 'voucher-apply' }),
    onCheckout: () => dispatch({ type: 'checkout', court }),
  };
}
