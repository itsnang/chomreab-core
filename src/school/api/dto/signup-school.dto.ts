import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignupSchoolDto {
  @ApiProperty({ example: 'Rise Tutoring Center' })
  @IsString()
  @MinLength(1)
  school_name: string;

  @ApiProperty({ example: 'Sochua Ly' })
  @IsString()
  @MinLength(1)
  admin_name: string;

  @ApiProperty({ example: 'sochua@example.com' })
  @IsEmail()
  admin_email: string;

  @ApiProperty({ example: 'a-strong-password' })
  @IsString()
  @MinLength(8)
  password: string;
}
