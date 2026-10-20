import { IsLoginPassword } from '../validators/auth.validators.js';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  LOGIN_IDENTIFIER_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_BYTES,
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
    description: `Mật khẩu thô, tối đa ${LOGIN_PASSWORD_MAX_BYTES} byte UTF-8`,
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsLoginPassword()
  password!: string;
}
