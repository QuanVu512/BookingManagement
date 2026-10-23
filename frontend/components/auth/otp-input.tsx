'use client';

import { useOtpInput } from '../../hooks/use-otp-input';
import { EMAIL_OTP_LENGTH } from '../../lib/email-otp';
import styles from './otp-input.module.css';

interface OtpInputProps {
  digits: readonly string[];
  onChange: (digits: string[]) => void;
  error?: string;
}

export function OtpInput({ digits, onChange, error }: OtpInputProps) {
  const control = useOtpInput({ digits, onChange });
  return (
    <div
      role="group"
      aria-labelledby="verification-code-label"
      aria-describedby={error ? 'otp-error' : undefined}
      className={styles.grid}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            control.inputs.current[index] = element;
          }}
          id={`verification-code-${index}`}
          data-otp-digit={index}
          className={styles.digit}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={index === 0}
          aria-label={`Chữ số ${index + 1} trên ${EMAIL_OTP_LENGTH}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'otp-error' : undefined}
          required
          value={digit}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => control.fill(index, event.target.value)}
          onPaste={(event) => control.paste(index, event)}
          onKeyDown={(event) => control.navigate(index, event)}
        />
      ))}
    </div>
  );
}
