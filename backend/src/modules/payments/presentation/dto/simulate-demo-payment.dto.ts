import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * BE-PAY-DEMO — DTO mô phỏng thanh toán showcase.
 * - Member: không cần body (owner suy từ JWT + request).
 * - Guest: bắt buộc bookingId trong body để GuestTokenGuard bind token
 *   đúng booking (không qua query để tránh rò rỉ log/referrer).
 */
export class SimulateDemoPaymentDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
