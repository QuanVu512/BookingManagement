import { describe, expect, it } from '@jest/globals';
import {
  stripTimezoneOptions,
  utcConnectionString,
  utcSessionOptions,
} from './prisma.service.js';

function optionsOf(connectionString: string): string {
  return new URL(connectionString).searchParams.get('options') ?? '';
}

function countTimezoneTokens(options: string): number {
  return (options.match(/-c\s*timezone(?=\s|=)/gi) ?? []).length;
}

const BASE = 'postgresql://app:secret@db.internal:5432/booking';

describe('PrismaService — session PostgreSQL luôn UTC', () => {
  it('URL không có options: thêm đúng một -c timezone=UTC', () => {
    const result = utcConnectionString(BASE);

    expect(optionsOf(result)).toBe('-c timezone=UTC');
    expect(new URL(result).pathname).toBe('/booking');
    expect(new URL(result).hostname).toBe('db.internal');
    expect(countTimezoneTokens(optionsOf(result))).toBe(1);
  });

  it('URL có options khác: giữ options và nối UTC', () => {
    const url = new URL(BASE);
    url.searchParams.set('options', '-c statement_timeout=5000');

    const options = optionsOf(utcConnectionString(url.href));

    expect(options).toContain('-c statement_timeout=5000');
    expect(options).toContain('-c timezone=UTC');
    expect(countTimezoneTokens(options)).toBe(1);
  });

  it('URL có timezone non-UTC: ghi đè thành UTC, không giữ giá trị cũ', () => {
    const url = new URL(BASE);
    url.searchParams.set('options', '-c timezone=Asia/Bangkok');

    const options = optionsOf(utcConnectionString(url.href));

    expect(options).toBe('-c timezone=UTC');
    expect(options).not.toContain('Asia/Bangkok');
  });

  it('URL có timezone non-UTC cùng options khác: giữ options khác', () => {
    const url = new URL(BASE);
    url.searchParams.set(
      'options',
      '-c statement_timeout=5000 -c timezone=Asia/Bangkok',
    );

    const options = optionsOf(utcConnectionString(url.href));

    expect(options).toContain('-c statement_timeout=5000');
    expect(options).not.toContain('Asia/Bangkok');
    expect(options.endsWith('-c timezone=UTC')).toBe(true);
    expect(countTimezoneTokens(options)).toBe(1);
  });

  it('xử lý timezone có quote và khác hoa/thường', () => {
    const url = new URL(BASE);
    url.searchParams.set(
      'options',
      "-c TimeZone = 'Asia/Bangkok' -c application_name=guest",
    );

    const options = optionsOf(utcConnectionString(url.href));

    expect(options).not.toContain('Asia/Bangkok');
    expect(options).toContain('-c application_name=guest');
    expect(countTimezoneTokens(options)).toBe(1);
  });

  it('idempotent khi chạy lại trên URL đã chuẩn hóa', () => {
    const once = utcConnectionString(BASE);
    const twice = utcConnectionString(once);

    expect(optionsOf(twice)).toBe(optionsOf(once));
    expect(countTimezoneTokens(optionsOf(twice))).toBe(1);
  });

  it('giữ các query param khác của URL', () => {
    const url = new URL(BASE);
    url.searchParams.set('schema', 'public');
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('options', '-c statement_timeout=1000');

    const result = utcConnectionString(url.href);

    expect(new URL(result).searchParams.get('schema')).toBe('public');
    expect(new URL(result).searchParams.get('sslmode')).toBe('require');
    expect(optionsOf(result)).toContain('-c statement_timeout=1000');
  });

  it('ghi đè được dạng timezone tách rời giá trị', () => {
    expect(
      utcSessionOptions('-c timezone Asia/Bangkok -c statement_timeout=1000'),
    ).toBe('-c statement_timeout=1000 -c timezone=UTC');
  });

  it('stripTimezoneOptions chỉ bỏ timezone, không bỏ option khác', () => {
    expect(
      stripTimezoneOptions('-c statement_timeout=5000 -c timezone=UTC'),
    ).toBe('-c statement_timeout=5000');
    expect(stripTimezoneOptions('-c timezone=UTC')).toBe('');
  });

  it('từ chối DATABASE_URL không phải URL PostgreSQL', () => {
    expect(() => utcConnectionString('host=localhost dbname=booking')).toThrow(
      /URL PostgreSQL hợp lệ/u,
    );
    expect(() => utcConnectionString('mysql://app@db/booking')).toThrow(
      /postgresql:\/\//u,
    );
  });
});
