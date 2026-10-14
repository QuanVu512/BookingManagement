import { IsAuthPassword } from '../validators/auth.validators.js';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  AUTH_VALIDATION_MESSAGES,
  LOGIN_IDENTIFIER_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../constants/auth-validation.constants.js';
import { trimAuthValue } from '../helpers/auth-normalization.js';

export class LoginDto {
  @ApiProperty({
    description: 'Tên đăng nhập, email hoặc số điện thoại',
    maxLength: LOGIN_IDENTIFIER_MAX_LENGTH,
  })
  @Transform(trimAuthValue)
  @IsString()
  @IsNotEmpty({ message: 'Tên đăng nhập không được để trống' })
  @MaxLength(LOGIN_IDENTIFIER_MAX_LENGTH)
  username!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsAuthPassword({ message: AUTH_VALIDATION_MESSAGES.password })
  password!: string;
}
