import {
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class StaffLateCancelDto {
  @IsString()
  @Length(5, 500)
  reason!: string;

  @IsString()
  @Length(16, 100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}
