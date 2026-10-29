import { ApiProperty } from '@nestjs/swagger';

export class CourtOccupiedIntervalDto {
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) bufferEndsAt!: string;
  @ApiProperty({ enum: ['HOLDING', 'CONFIRMED', 'MAINTENANCE'] })
  kind!: 'HOLDING' | 'CONFIRMED' | 'MAINTENANCE';
}

export class CourtDayBusinessHoursDto {
  @ApiProperty() isClosed!: boolean;
  @ApiProperty({ nullable: true }) open!: string | null;
  @ApiProperty({ nullable: true }) close!: string | null;
}

export class CourtDayOccupanciesDto {
  @ApiProperty({ format: 'uuid' }) courtId!: string;
  @ApiProperty({ example: '2026-10-30' }) date!: string;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone!: string;
  @ApiProperty({ format: 'date-time' }) serverNow!: string;
  @ApiProperty({ type: 'integer' }) cleanupMinutes!: number;
  @ApiProperty({ type: CourtDayBusinessHoursDto })
  businessHours!: CourtDayBusinessHoursDto;
  @ApiProperty({ type: [CourtOccupiedIntervalDto] })
  occupiedIntervals!: CourtOccupiedIntervalDto[];
}

export class CourtDayOccupanciesResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: CourtDayOccupanciesDto }) data!: CourtDayOccupanciesDto;
}
