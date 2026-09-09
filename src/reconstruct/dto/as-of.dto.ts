import { IsISO8601 } from 'class-validator';

export class AsOfDto {
  // The past instant to reconstruct the store at (ISO date + time).
  @IsISO8601()
  at: string;
}
