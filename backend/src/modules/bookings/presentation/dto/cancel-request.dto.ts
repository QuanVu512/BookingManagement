import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class RequestCancelQuoteDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;

  @IsString()
  @Length(16, 100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}

export class ApplyCancelDto {
  @IsUUID()
  quoteId!: string;

  @IsBoolean()
  accepted!: boolean;

  @IsString()
  @Length(16, 100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}
