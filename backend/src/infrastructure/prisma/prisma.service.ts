import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

const UTC_TIMEZONE_OPTION = '-c timezone=UTC';

/**
 * Prisma encode `DateTime` thành UTC wall-clock không kèm offset, nên
 * `timestamptz` chỉ đúng khi session PostgreSQL chạy ở UTC. Nếu server/role để
 * timezone khác (ví dụ Windows mặc định `Asia/Bangkok`), mọi mốc do app ghi sẽ
 * lệch đúng offset đó và các so sánh SQL với `now()`/`clock_timestamp()` sai.
 *
 * Ưu tiên cấu hình của `pg`: `ConnectionParameters` dựng bằng
 * `Object.assign({}, config, parse(config.connectionString))`, nên `options`
 * nằm trong connection string LUÔN thắng trường `options` truyền riêng. Vì vậy
 * timezone phải được chuẩn hóa ngay trong connection string và chỉ truyền một
 * nguồn duy nhất cho adapter.
 */

/** Bỏ mọi khai báo timezone trong chuỗi options, giữ các tuỳ chọn `-c` khác. */
export function stripTimezoneOptions(options: string): string {
  return options
    .replace(
      /(^|\s)-c\s*timezone\s*=\s*(?:'[^']*'|"[^"]*"|[^\s]+)/gi,
      ' ',
    )
    .replace(/(^|\s)-c\s*timezone\s+(?:'[^']*'|"[^"]*"|[^\s]+)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ghép options đã bỏ timezone cũ với đúng một `-c timezone=UTC`. */
export function utcSessionOptions(options = ''): string {
  const preserved = stripTimezoneOptions(options);
  return preserved
    ? `${preserved} ${UTC_TIMEZONE_OPTION}`
    : UTC_TIMEZONE_OPTION;
}

/**
 * Trả connection string đã chuẩn hóa timezone. `options` trong URL được viết
 * lại (không phải thêm trường song song) để pg chỉ còn một nguồn cấu hình.
 * Tuỳ chọn khác như `statement_timeout` được giữ nguyên.
 */
export function utcConnectionString(connectionString: string): string {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error(
      'DATABASE_URL phải là URL PostgreSQL hợp lệ để ghim session timezone UTC.',
    );
  }
  if (!['postgresql:', 'postgres:'].includes(target.protocol)) {
    throw new Error(
      'DATABASE_URL phải dùng protocol postgresql:// hoặc postgres://.',
    );
  }
  target.searchParams.set(
    'options',
    utcSessionOptions(target.searchParams.get('options') ?? ''),
  );
  return target.toString();
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg(
      utcConnectionString(
        configService.getOrThrow<string>('DATABASE_URL'),
      ),
    );
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
