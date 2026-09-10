import { IsIn, IsMongoId, IsOptional } from 'class-validator';

const RESERVATION_STATUSES = ['active', 'collected', 'cancelled'] as const;

export class ListReservationsDto {
  @IsOptional()
  @IsMongoId()
  assetId?: string;

  @IsOptional()
  @IsMongoId()
  workerId?: string;

  @IsOptional()
  @IsIn(RESERVATION_STATUSES)
  status?: string;
}
