import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { PrivacyRequestType } from '../../domain/privacy-request.js';

export class CreatePrivacyRequestDto {
  @IsIn([
    'ACCESS',
    'CORRECT',
    'ERASE',
    'WITHDRAW',
    'RESTRICT',
    'OBJECT',
    'PROTECT',
    'OTHER',
  ])
  type: PrivacyRequestType;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @IsString()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
