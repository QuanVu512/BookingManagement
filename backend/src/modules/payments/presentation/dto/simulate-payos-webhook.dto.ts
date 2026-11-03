import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class SimulatePayosWebhookDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  orderCode?: number;

  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
