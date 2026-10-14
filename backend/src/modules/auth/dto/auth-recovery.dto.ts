import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import {
  AUTH_FIELD_MAX_LENGTH,
  AUTH_RANDOM_TOKEN_PATTERN,
  AUTH_VALIDATION_MESSAGES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../constants/auth-validation.constants.js';
import { normalizeEmailValue } from '../helpers/auth-normalization.js';
import {
  IsAuthPassword,
  MatchesPassword,
} from '../validators/auth.validators.js';

export class AuthEmailDto {
  @ApiProperty({ format: 'email', maxLength: AUTH_FIELD_MAX_LENGTH.email })
  @Transform(normalizeEmailValue)
  @IsString()
  @IsEmail()
  @MaxLength(AUTH_FIELD_MAX_LENGTH.email)
  email!: string;
}

export class AuthTokenDto {
  @ApiProperty({ minLength: 64, maxLength: 64, writeOnly: true })
  @IsString()
  @Matches(AUTH_RANDOM_TOKEN_PATTERN, {
    message: 'Liên kết không hợp lệ hoặc đã hết hạn.',
  })
  token!: string;
}

export class ResetPasswordDto extends AuthTokenDto {
  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    writeOnly: true,
  })
  @IsString()
  @IsAuthPassword({ message: AUTH_VALIDATION_MESSAGES.password })
  password!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    writeOnly: true,
  })
  @IsString()
  @IsAuthPassword({ message: AUTH_VALIDATION_MESSAGES.password })
  @MatchesPassword({ message: AUTH_VALIDATION_MESSAGES.confirmPassword })
  confirmPassword!: string;
}
