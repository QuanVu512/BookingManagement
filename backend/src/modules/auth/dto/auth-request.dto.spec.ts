import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { REQUEST_VALIDATION_OPTIONS } from '../../../constants/validation.constants.js';
import { LoginDto } from './login.dto.js';
import { RegisterDto } from './register.dto.js';

const LOGIN_PAYLOAD = { username: 'customer', password: 'SecretPhrase1!' };
const REGISTER_PAYLOAD = {
  ...LOGIN_PAYLOAD,
  confirmPassword: LOGIN_PAYLOAD.password,
  fullName: 'Test Customer',
  email: 'customer@example.com',
  phone: '0900000000',
};
const INVALID_REQUIRED_VALUES = [undefined, null, '', 42, true, [], {}];

describe('Auth request validation', () => {
  const pipe = new ValidationPipe(REQUEST_VALIDATION_OPTIONS);

  describe.each([
    { name: 'login', dto: LoginDto, payload: LOGIN_PAYLOAD },
    { name: 'register', dto: RegisterDto, payload: REGISTER_PAYLOAD },
  ])('$name', ({ dto, payload }) => {
    it('transforms valid input to a DTO without changing the password', async () => {
      const result: unknown = await pipe.transform(payload, {
        type: 'body',
        metatype: dto,
      });
      expect(result).toBeInstanceOf(dto);
      expect(result).toEqual(
        dto === RegisterDto ? { ...payload, phone: '+84900000000' } : payload,
      );
    });

    it.each(Object.keys(payload))(
      'requires a nonempty string for %s',
      async (field) => {
        for (const value of INVALID_REQUIRED_VALUES) {
          await expect(
            pipe.transform(
              { ...payload, [field]: value },
              {
                type: 'body',
                metatype: dto,
              },
            ),
          ).rejects.toBeInstanceOf(BadRequestException);
        }
      },
    );

    it('rejects an undeclared field', async () => {
      await expect(
        pipe.transform(
          { ...payload, role: 'ADMIN' },
          {
            type: 'body',
            metatype: dto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it.each([
    ['username', 'a'.repeat(100), 'a'.repeat(101)],
    ['fullName', 'a'.repeat(150), 'a'.repeat(151)],
    ['email', createEmail(254), createEmail(255)],
  ])(
    'enforces the schema length for register %s',
    async (field, accepted, rejected) => {
      const metadata = { type: 'body' as const, metatype: RegisterDto };
      await expect(
        pipe.transform({ ...REGISTER_PAYLOAD, [field]: accepted }, metadata),
      ).resolves.toBeInstanceOf(RegisterDto);
      await expect(
        pipe.transform({ ...REGISTER_PAYLOAD, [field]: rejected }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(['customer', '0900000000', createEmail(254)])(
    'accepts login identifier %s',
    async (username) => {
      await expect(
        pipe.transform(
          { ...LOGIN_PAYLOAD, username },
          {
            type: 'body',
            metatype: LoginDto,
          },
        ),
      ).resolves.toBeInstanceOf(LoginDto);
    },
  );

  it('rejects a login identifier exceeding the longest supported field', async () => {
    await expect(
      pipe.transform(
        { ...LOGIN_PAYLOAD, username: 'a'.repeat(255) },
        {
          type: 'body',
          metatype: LoginDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed email', async () => {
    await expect(
      pipe.transform(
        { ...REGISTER_PAYLOAD, email: 'invalid-email' },
        {
          type: 'body',
          metatype: RegisterDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['username', 'fullName', 'phone'])(
    'rejects whitespace-only register %s',
    async (field) => {
      await expect(
        pipe.transform(
          { ...REGISTER_PAYLOAD, [field]: '   ' },
          {
            type: 'body',
            metatype: RegisterDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects a whitespace-only login identifier', async () => {
    await expect(
      pipe.transform(
        { ...LOGIN_PAYLOAD, username: '   ' },
        {
          type: 'body',
          metatype: LoginDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Auth completion rules', () => {
  const pipe = new ValidationPipe(REQUEST_VALIDATION_OPTIONS);
  const metadata = { type: 'body' as const, metatype: RegisterDto };
  it.each(['abcd1234', 'abcdefgh', '1234abcd'])(
    'accepts username %s',
    async (username) => {
      await expect(
        pipe.transform({ ...REGISTER_PAYLOAD, username }, metadata),
      ).resolves.toBeInstanceOf(RegisterDto);
    },
  );
  it.each([
    'abcdefg',
    '12345678',
    'name_test',
    'name.test',
    'nguyễnvan',
    'name test',
  ])('rejects username %s', async (username) => {
    await expect(
      pipe.transform({ ...REGISTER_PAYLOAD, username }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    'a'.repeat(7),
    'a'.repeat(64),
    'a' + '😀'.repeat(127),
    'abc def',
    'mậtkhẩu123',
    '  mật khẩu dài có dấu 😀  ',
  ])('accepts a bounded Unicode passphrase %s', async (password) => {
    await expect(
      pipe.transform(
        { ...REGISTER_PAYLOAD, password, confirmPassword: password },
        metadata,
      ),
    ).resolves.toBeInstanceOf(RegisterDto);
  });
  it.each([
    'a'.repeat(6),
    '1234567',
    '😀'.repeat(128),
    'a'.repeat(129),
    '😀'.repeat(129),
  ])('rejects password %s', async (password) => {
    await expect(
      pipe.transform(
        { ...REGISTER_PAYLOAD, password, confirmPassword: password },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['0912345678', '+84912345678', '02431234567'])(
    'accepts valid Vietnamese phone %s',
    async (phone) => {
      await expect(
        pipe.transform({ ...REGISTER_PAYLOAD, phone }, metadata),
      ).resolves.toBeInstanceOf(RegisterDto);
    },
  );
  it.each([
    '0123456789',
    '+12025550123',
    '84912345678',
    'call 0912345678',
    '0912-345-678',
    '1'.repeat(21),
  ])('rejects invalid or unsupported phone %s', async (phone) => {
    await expect(
      pipe.transform({ ...REGISTER_PAYLOAD, phone }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('normalizes account fields while preserving the password exactly', async () => {
    const result: unknown = await pipe.transform(
      {
        ...REGISTER_PAYLOAD,
        username: ' customer ',
        fullName: ' Nguyễn Văn A ',
        email: ' Customer@Enterprise.vn ',
        phone: ' 0912345678 ',
      },
      metadata,
    );
    expect(result).toMatchObject({
      username: 'customer',
      fullName: 'Nguyễn Văn A',
      email: 'customer@enterprise.vn',
      phone: '+84912345678',
      password: LOGIN_PAYLOAD.password,
      confirmPassword: LOGIN_PAYLOAD.password,
    });
  });
  it.each(['other-password', undefined])(
    'rejects mismatched or missing confirmation',
    async (confirmPassword) => {
      await expect(
        pipe.transform({ ...REGISTER_PAYLOAD, confirmPassword }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

function createEmail(length: number): string {
  const localPart = 'a'.repeat(64);
  const domainPrefix = `${'b'.repeat(63)}.${'c'.repeat(63)}.`;
  const suffix = '.com';
  const remainingLength =
    length - localPart.length - domainPrefix.length - suffix.length - 1;
  return `${localPart}@${domainPrefix}${'d'.repeat(remainingLength)}${suffix}`;
}
