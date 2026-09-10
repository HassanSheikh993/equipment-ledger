import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ListAssetsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  kind?: string;
}
