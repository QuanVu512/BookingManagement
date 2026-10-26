import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

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
}
