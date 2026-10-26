import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * C12 — PATCH /api/users/me/profile. Mọi field optional; patch rỗng → 400
 * ở use-case. Giới hạn độ dài theo schema (domain policy chốt giá trị).
 */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MaxLength(2000)
  avatarUrl?: string | null;
}
