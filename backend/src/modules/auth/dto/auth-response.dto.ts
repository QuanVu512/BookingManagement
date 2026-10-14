import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../enums/index.js';

export class AuthUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true })
  roles!: Role[];

  @ApiProperty({ enum: Role, enumName: 'Role' })
  primaryRole!: Role;

  @ApiProperty()
  isStaffOrAdmin!: boolean;
}

export class AuthSessionResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: () => AuthUserResponseDto })
  user!: AuthUserResponseDto;
}

export class AuthResponseDto extends AuthSessionResponseDto {
  @ApiProperty()
  message!: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty()
  message!: string;
}
