import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateTeacherDto {
  @ApiProperty({ example: 'Chenda Ly' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'chenda@school.edu' })
  @IsEmail()
  email: string;
}
