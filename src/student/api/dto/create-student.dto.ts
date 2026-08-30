import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'Sokha' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty()
  @IsUUID()
  classroom_id: string;
}
