export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_PATTERN = /^[0-9]{6}$/;
export const NON_OTP_DIGITS_PATTERN = /[^0-9]/g;

export function emptyOtpDigits(): string[] {
  return Array.from({ length: EMAIL_OTP_LENGTH }, () => '');
}
