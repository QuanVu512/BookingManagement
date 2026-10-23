'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { EMAIL_OTP_LENGTH, NON_OTP_DIGITS_PATTERN } from '../lib/email-otp';

interface OtpInputOptions {
  digits: readonly string[];
  onChange: (digits: string[]) => void;
}

export function useOtpInput({ digits, onChange }: OtpInputOptions) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  function focus(index: number) {
    inputs.current[index]?.focus();
    inputs.current[index]?.select();
  }
  function fill(index: number, text: string) {
    const numbers = text
      .replace(NON_OTP_DIGITS_PATTERN, '')
      .slice(0, EMAIL_OTP_LENGTH);
    if (text && !numbers) return;
    const start = numbers.length === EMAIL_OTP_LENGTH ? 0 : index;
    const updated = [...digits];
    if (!numbers) {
      updated[index] = '';
      onChange(updated);
      return;
    }
    const inserted = numbers.slice(0, EMAIL_OTP_LENGTH - start);
    Array.from(inserted).forEach((digit, offset) => {
      updated[start + offset] = digit;
    });
    onChange(updated);
    focus(Math.min(start + inserted.length, EMAIL_OTP_LENGTH - 1));
  }
  function paste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fill(index, event.clipboardData.getData('text'));
  }
  function navigate(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const updated = [...digits];
      updated[index - 1] = '';
      onChange(updated);
      focus(index - 1);
      return;
    }
    const target = navigationTarget(index, event.key);
    if (target === undefined) return;
    event.preventDefault();
    focus(target);
  }
  return { inputs, fill, paste, navigate };
}

function navigationTarget(index: number, key: string): number | undefined {
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'ArrowRight') return Math.min(EMAIL_OTP_LENGTH - 1, index + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return EMAIL_OTP_LENGTH - 1;
  return undefined;
}
