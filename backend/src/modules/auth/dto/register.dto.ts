import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AUTH_FIELD_MAX_LENGTH,
  AUTH_VALIDATION_MESSAGES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../constants/auth-validation.constants.js';
import {
  trimAuthValue,
  normalizeEmailValue,
  normalizePhoneValue,
} from '../helpers/auth-normalization.js';
import {
  IsVietnamPhone,
  IsAuthPassword,
  MatchesPassword,
} from '../validators/auth.validators.js';

export class RegisterDto {
  @ApiProperty({
    minLength: USERNAME_MIN_LENGTH,
    maxLength: AUTH_FIELD_MAX_LENGTH.username,
    pattern: USERNAME_PATTERN.source,
  })
  @Transform(trimAuthValue)
  @IsString()
  @IsNotEmpty()
  @MinLength(USERNAME_MIN_LENGTH, {
    message: AUTH_VALIDATION_MESSAGES.username,
  })
  @Matches(USERNAME_PATTERN, { message: AUTH_VALIDATION_MESSAGES.username })
  @MaxLength(AUTH_FIELD_MAX_LENGTH.username)
  username!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  @IsAuthPassword({ message: AUTH_VALIDATION_MESSAGES.password })
  password!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  @IsAuthPassword({ message: AUTH_VALIDATION_MESSAGES.password })
  @MatchesPassword({ message: AUTH_VALIDATION_MESSAGES.confirmPassword })
  confirmPassword!: string;

  @ApiProperty({ maxLength: AUTH_FIELD_MAX_LENGTH.fullName })
  @Transform(trimAuthValue)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(AUTH_FIELD_MAX_LENGTH.fullName)
  fullName!: string;

  @ApiProperty({ format: 'email', maxLength: AUTH_FIELD_MAX_LENGTH.email })
  @Transform(normalizeEmailValue)
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(AUTH_FIELD_MAX_LENGTH.email)
  email!: string;

  @ApiProperty({ maxLength: AUTH_FIELD_MAX_LENGTH.phone })
  @Transform(normalizePhoneValue)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @IsVietnamPhone({ message: AUTH_VALIDATION_MESSAGES.phone })
  @MaxLength(AUTH_FIELD_MAX_LENGTH.phone)
  phone!: string;
}
