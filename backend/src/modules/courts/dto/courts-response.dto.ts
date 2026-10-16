import { ApiProperty } from '@nestjs/swagger';
import { CourtStatus, CourtType } from '../../../enums/index.js';

export class PublicCourtDto {
  @ApiProperty({ description: 'UUID sân từ database' })
  id!: string;

  @ApiProperty() timezone!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() address!: string;
  @ApiProperty({ type: 'integer' }) cleanupMinutes!: number;
  @ApiProperty() priceLabel!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: CourtType, enumName: 'CourtType' })
  courtType!: CourtType;

  @ApiProperty({ enum: CourtStatus, enumName: 'CourtStatus' })
  status!: CourtStatus;

  @ApiProperty()
  surfaceType!: string;

  @ApiProperty({ type: [String] })
  features!: string[];

  @ApiProperty({
    description:
      'Giá từ trong ngày (VND/giờ), 0 = chưa có giá. Báo giá chính xác qua availability.',
  })
  pricePerHour!: number;

  @ApiProperty()
  imageUrl!: string;

  @ApiProperty()
  rating!: number;

  @ApiProperty({ type: 'integer' })
  reviewCount!: number;
}

export class CourtsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: () => [PublicCourtDto] })
  data!: PublicCourtDto[];
}
