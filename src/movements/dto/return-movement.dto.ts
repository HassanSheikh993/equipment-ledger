import {
  IsBoolean,
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class ReturnMovementDto {
  @IsMongoId()
  assetId: string;

  // Whoever is handing the tool back. Not matched against the current holder -
  // anyone can return. Must still be a real worker from the list.
  @IsMongoId()
  workerId: string;

  // Full date + time the return actually happened. Frontend prefills "now",
  // storekeeper can edit it for a late entry.
  @IsISO8601()
  occurredAt: string;

  // Unique key from the frontend (UUID). Same key = same movement, never twice.
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  // Store keeper name, picked from a fixed list on the frontend.
  @IsString()
  @IsNotEmpty()
  recordedBy: string;

  // Tool came back broken -> asset goes out of service.
  @IsOptional()
  @IsBoolean()
  damaged?: boolean;

  // Required when damaged is true - a reason a human can read.
  @ValidateIf((o: ReturnMovementDto) => o.damaged === true)
  @IsString()
  @IsNotEmpty()
  damageReason?: string;
}
