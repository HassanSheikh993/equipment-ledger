import { IsNotEmpty, IsString } from 'class-validator';

export class OutOfServiceDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
