import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../../../../enums/index.js';

export class BookingPriceItemDto {
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty({ type: 'integer' }) durationMinutes!: number;
  @ApiProperty({ type: 'integer' }) pricePerHour!: number;
  @ApiProperty({ type: 'integer' }) amount!: number;
}
export class BookingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty({ format: 'uuid' }) courtId!: string;
  @ApiProperty() courtName!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty({ format: 'date-time' }) holdExpiresAt!: string;
  @ApiProperty({ enum: BookingStatus }) status!: BookingStatus;
  @ApiProperty({ type: 'integer' }) totalAmount!: number;
  @ApiProperty({ example: 'VND' }) currency!: string;
  @ApiProperty({ type: [BookingPriceItemDto] })
  priceItems!: BookingPriceItemDto[];
}
export class BookingResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: BookingDto }) data!: BookingDto;
}
export class MyBookingsResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: [BookingDto] }) data!: BookingDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class AvailabilityDto {
  @ApiProperty() available!: boolean;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) serverNow!: string;
  @ApiProperty({ format: 'date-time' }) occupiedUntil!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: 'integer' }) cleanupMinutes!: number;
  @ApiProperty({ type: 'integer' }) totalAmount!: number;
  @ApiProperty({ example: 'VND' }) currency!: string;
  @ApiProperty({ type: [BookingPriceItemDto] })
  priceItems!: BookingPriceItemDto[];
}
export class AvailabilityResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: AvailabilityDto }) data!: AvailabilityDto;
}
