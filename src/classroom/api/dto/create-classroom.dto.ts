import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateClassroomDto {
  @ApiProperty({ example: 'Grade 3A' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'Grade 3', required: false })
  @IsOptional()
  @IsString()
  grade_label?: string;

  @ApiProperty({ required: false, description: 'Teacher user id' })
  @IsOptional()
  @IsUUID()
  teacher_id?: string;
}
