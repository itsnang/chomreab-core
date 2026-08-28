import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'a3f9c2...64-char-hex-token...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newSecret123' })
  @IsString()
  @MinLength(8)
  new_password: string;
}
