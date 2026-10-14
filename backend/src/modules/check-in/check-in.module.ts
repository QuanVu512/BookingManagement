import { Module } from '@nestjs/common';

// Domain boundary only; no booking, payment or check-in implementation.
@Module({})
export class CheckInModule {}
