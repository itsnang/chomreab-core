import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'a3f9c2...64-char-hex-token...' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
