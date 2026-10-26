import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * BE-PAY-08 — DTO tạo payment request E5 (MIG-10, MIG-12).
 * Body idempotencyKey là canonical; percent explicit từ client v2
 * (client cũ thiếu percent → default 100 ở rollout; v3 mặc định 30).
 */
export class CreatePaymentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({ enum: ['PREPAYMENT', 'BALANCE'] })
  @IsIn(['PREPAYMENT', 'BALANCE'])
  purpose!: 'PREPAYMENT' | 'BALANCE';

  @ApiPropertyOptional({ enum: [30, 100], default: 30 })
  @IsOptional()
  @IsInt()
  @IsIn([30, 100])
  prepaymentPercent?: 30 | 100;

  @ApiProperty({
    enum: ['PAYOS_TRANSFER', 'MANUAL_BANK_TRANSFER', 'CASH'],
  })
  @IsIn(['PAYOS_TRANSFER', 'MANUAL_BANK_TRANSFER', 'CASH'])
  method!: 'PAYOS_TRANSFER' | 'MANUAL_BANK_TRANSFER' | 'CASH';

  @ApiProperty({ minLength: 16, maxLength: 100 })
  @IsString()
  @Length(16, 100)
  idempotencyKey!: string;
}

export class PaymentRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() paymentCode!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() method!: string;
  @ApiPropertyOptional() providerOrderCode!: string | null;
  @ApiPropertyOptional() checkoutUrl!: string | null;
  @ApiPropertyOptional() vietQrPayload!: string | null;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() expiresAt!: string | null;
  @ApiProperty() reviewRequired!: boolean;
  @ApiPropertyOptional() reviewReasonCode!: string | null;
}

export class PrepareManualRefundDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  refundRequestId!: string;

  @ApiProperty() @IsInt() @Min(1) @Max(999_999_999_999) amount!: number;

  @ApiProperty() @IsString() @Length(1, 100) sourceAccountKey!: string;

  @ApiProperty() @IsString() @Length(2, 10) destinationBankBin!: string;

  @ApiProperty() @IsString() @Length(4, 4) destinationAccountLast4!: string;

  @ApiProperty() @IsString() @Length(1, 150) destinationAccountName!: string;

  @ApiProperty() @IsString() @Length(16, 150) idempotencyKey!: string;
}

export class CompleteManualRefundDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attemptId!: string;

  @ApiProperty() @IsString() @Length(1, 150) bankTransactionReference!: string;

  @ApiProperty() @IsString() @Length(6, 500) evidenceReference!: string;
}

export class RefundQuoteRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cancellationRequestId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(16, 100)
  idempotencyKey?: string;
}

export class StaffBalanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({ enum: ['CASH', 'MANUAL_BANK_TRANSFER'] })
  @IsIn(['CASH', 'MANUAL_BANK_TRANSFER'])
  method!: 'CASH' | 'MANUAL_BANK_TRANSFER';

  @ApiPropertyOptional({ description: 'Chỉ stale-check (D-06)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999_999_999_999)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  transactionReference?: string;

  @ApiProperty()
  @IsString()
  @Length(16, 100)
  idempotencyKey!: string;
}

export class StaffAllocateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  paymentRequestId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @ApiProperty()
  @IsString()
  @Length(16, 100)
  idempotencyKey!: string;
}

export class RefundApproveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @ApiProperty()
  @IsString()
  @Length(16, 100)
  idempotencyKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 10)
  destinationBankBin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(4, 4)
  destinationAccountLast4?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  destinationAccountName?: string;

  @ApiPropertyOptional({ description: 'Chỉ persist khi có key mã hóa (OD-12)' })
  @IsOptional()
  @IsString()
  @Length(6, 32)
  destinationAccountNumber?: string;
}

export class RefundRejectDto {
  @ApiProperty()
  @IsString()
  @Length(4, 500)
  rejectionReason!: string;

  @ApiProperty()
  @IsString()
  @Length(16, 100)
  idempotencyKey!: string;
}

export class RefundReconcileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  bankTransactionReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(6, 500)
  evidenceReference?: string;
}
