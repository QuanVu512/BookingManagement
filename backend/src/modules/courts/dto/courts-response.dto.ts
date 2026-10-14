import { ApiProperty } from '@nestjs/swagger';
import { CourtStatus, CourtType } from '../../../enums/index.js';

export class PublicCourtDto {
  @ApiProperty({ description: 'UUID sân hoặc ID của danh mục mẫu' })
  id!: string;

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

  @ApiProperty({ description: 'Giá mỗi giờ, đơn vị VND' })
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
