import {
  IsString,
  IsUUID,
  Length,
  MinLength,
} from 'class-validator';

export class VerifyCheckinDto {
  @IsUUID()
  bookingId!: string;

  @IsString()
  @MinLength(32)
  token!: string;
}

export class ManualCheckinDto {
  @IsUUID()
  bookingId!: string;

  @IsString()
  @Length(5, 500)
  note!: string;
}
