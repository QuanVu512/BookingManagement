import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CourtsModule } from '../courts/courts.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [AuthModule, CourtsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
