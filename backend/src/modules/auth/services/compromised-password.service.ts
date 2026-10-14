import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isValidAuthPassword } from '../helpers/auth-password.js';
import {
  AUTH_VALIDATION_MESSAGES,
  PASSWORD_RANGE_URL,
  PASSWORD_RANGE_TIMEOUT_MS,
  PASSWORD_RANGE_MAX_RESPONSE_BYTES,
} from '../constants/auth-validation.constants.js';

@Injectable()
export class CompromisedPasswordService {
  async assertAllowed(password: string): Promise<void> {
    if (!isValidAuthPassword(password))
      throw new BadRequestException(AUTH_VALIDATION_MESSAGES.password);
    const hash = createHash('sha1')
      .update(password, 'utf8')
      .digest('hex')
      .toUpperCase();
    const records = await this.getRange(hash.slice(0, 5));
    const match = records.find(([suffix]) => suffix === hash.slice(5));
    if (match && Number(match[1]) > 0) {
      throw new BadRequestException(
        'Mật khẩu đã xuất hiện trong dữ liệu bị lộ. Vui lòng chọn mật khẩu khác.',
      );
    }
  }

  private async getRange(prefix: string): Promise<string[][]> {
    try {
      const signal = AbortSignal.timeout(PASSWORD_RANGE_TIMEOUT_MS);
      const response = await fetch(`${PASSWORD_RANGE_URL}${prefix}`, {
        signal,
        redirect: 'error',
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'BookingManagement-Password-Check',
        },
      });
      if (!response.ok) throw new Error('Range request failed');
      const body = await response.text();
      if (signal.aborted || body.length > PASSWORD_RANGE_MAX_RESPONSE_BYTES)
        throw new Error('Invalid range response');
      const records = body.trim().split(/\r?\n/);
      if (
        !records.length ||
        records.some((record) => !/^[A-F0-9]{35}:\d+$/.test(record))
      )
        throw new Error('Invalid range response');
      return records.map((record) => record.split(':'));
    } catch {
      throw new ServiceUnavailableException(
        'Chưa thể kiểm tra độ an toàn mật khẩu. Vui lòng thử lại.',
      );
    }
  }
}
