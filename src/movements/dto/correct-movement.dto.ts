import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CorrectMovementDto {
  @IsISO8601()
  occurredAt: string;

  @IsString()
  @IsNotEmpty()
  recordedBy: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
