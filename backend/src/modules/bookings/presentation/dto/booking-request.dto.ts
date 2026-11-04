import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ServiceSelectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class BookingWindowDto {
  @ApiProperty({
    format: 'date-time',
    description: 'ISO 8601 có timezone, chính xác đến phút',
  })
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt!: string;
}

export class QuoteCourtDto extends BookingWindowDto {
  @ApiProperty({ type: [ServiceSelectionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceSelectionDto)
  services?: ServiceSelectionDto[];
}

export class CreateBookingDto extends BookingWindowDto {
  @ApiProperty({
    description: 'Đồng ý điều khoản giữ chỗ 5 phút, chưa thanh toán',
    enum: [true],
  })
  @Equals(true)
  policyAccepted!: boolean;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courtId!: string;

  @ApiProperty({
    description: 'Khóa duy nhất theo người dùng, giữ nguyên khi retry',
  })
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  idempotencyKey!: string;

  @ApiProperty({
    description:
      'Chính sách đặt cọc bắt buộc 30% cho mọi lượt đặt sân mới. Bỏ trống server tự mặc định 30.',
    enum: [30],
    required: false,
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @IsIn([30])
  prepaymentPercent?: 30;

  @ApiProperty({ type: [ServiceSelectionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceSelectionDto)
  services?: ServiceSelectionDto[];
}
