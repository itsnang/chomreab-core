import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTeacherDto {
  @ApiPropertyOptional({ example: 'Chenda Ly' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'chenda@school.edu' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
