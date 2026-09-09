import {
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class IssueMovementDto {
  @IsMongoId()
  assetId: string;

  @IsMongoId()
  workerId: string;

  // Full date + time the issue actually happened. Frontend prefills "now",
  // storekeeper can edit it for a late entry.
  @IsISO8601()
  occurredAt: string;

  // Expected return time. Optional.
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  // Unique key from the frontend (UUID). Same key = same movement, never twice.
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  // Store keeper name, picked from a fixed list on the frontend.
  @IsString()
  @IsNotEmpty()
  recordedBy: string;

  // Set when the worker booked the asset in advance.
  @IsOptional()
  @IsMongoId()
  reservationId?: string;
}
