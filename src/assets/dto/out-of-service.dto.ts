import { IsNotEmpty, IsString } from 'class-validator';

export class OutOfServiceDto {
  // A reason a human can read, e.g. "cracked chuck".
  @IsString()
  @IsNotEmpty()
  reason: string;
}
