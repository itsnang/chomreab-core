import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';
import { StudentStatus } from '../../infrastructure/entities/student.entity';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @ApiProperty({ enum: StudentStatus, required: false })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
