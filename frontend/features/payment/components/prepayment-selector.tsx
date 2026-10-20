'use client';
import { formatVnd } from '../../booking/model/booking-time';

/**
 * FE-PAY-02/04 — Chọn trả trước 30%/100% (MIG-10, MIG-17).
 * Chỉ chọn label % khi chưa có quote server cho tiền cọc; số tiền hiển thị
 * luôn từ server quote, không hardcode 45k/105k ở runtime.
 */
export function PrepaymentSelector({
  options,
  selected,
  disabled,
  onSelect,
}: {
  options: { percent: 30 | 100; amount: number | null; label: string }[];
  selected: 30 | 100;
  disabled?: boolean;
  onSelect: (percent: 30 | 100) => void;
}) {
  return (
    <fieldset>
      <legend>Chọn hình thức trả trước</legend>
      {options.map((option) => (
        <label key={option.percent}>
          <input
            type="radio"
            name="prepayment-percent"
            value={option.percent}
            checked={selected === option.percent}
            disabled={disabled}
            onChange={() => onSelect(option.percent)}
          />
          {option.label}
          {option.amount !== null && (
            <strong> — {formatVnd(option.amount)}</strong>
          )}
        </label>
      ))}
    </fieldset>
  );
}
