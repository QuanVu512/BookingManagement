import { Injectable } from '@nestjs/common';
import { AuthMailService } from '../../auth/services/auth-mail.service.js';
import { GuestOtpSender } from '../ports/guest-otp-sender.js';

@Injectable()
export class AuthGuestOtpSender extends GuestOtpSender {
  constructor(private readonly mail: AuthMailService) {
    super();
  }

  sendCode(email: string, code: string): Promise<void> {
    return this.mail.sendEmailOtp(email, code);
  }
}
