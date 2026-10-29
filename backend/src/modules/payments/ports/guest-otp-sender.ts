/**
 * Bước 2 — port gửi OTP guest. Adapter production dùng AuthMailService; test
 * dùng fake để giữ code trong memory và không gọi SMTP thật.
 */
export abstract class GuestOtpSender {
  abstract sendCode(email: string, code: string): Promise<void>;
}
