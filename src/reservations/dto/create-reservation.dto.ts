import { IsISO8601, IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class CreateReservationDto {
  @IsMongoId()
  assetId: string;

  // The worker the asset is being booked for.
  @IsMongoId()
  workerId: string;

  // Start of the future window (ISO date + time).
  @IsISO8601()
  windowStart: string;

  // End of the window. Must be after windowStart, within 30 days.
  @IsISO8601()
  windowEnd: string;

  // Unique key from the frontend (UUID). Same key = same reservation, never twice.
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  // Store keeper name, picked from a fixed list on the frontend.
  @IsString()
  @IsNotEmpty()
  recordedBy: string;
}
