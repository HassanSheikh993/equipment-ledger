import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateAssetDto {
  // Unique identity, e.g. HARN-014.
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  // e.g. harness, drill, gas-detector.
  @IsString()
  @IsNotEmpty()
  kind: string;

  @IsOptional()
  @IsBoolean()
  requiresCertification?: boolean;

  // Required only when requiresCertification is true.
  @ValidateIf((o: CreateAssetDto) => o.requiresCertification === true)
  @IsString()
  @IsNotEmpty()
  certificationName?: string;
}
