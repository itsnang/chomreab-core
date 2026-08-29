import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class MarkAttendanceDto {
  @ApiProperty()
  @IsUUID()
  student_id: string;

  @ApiProperty()
  @IsUUID()
  classroom_id: string;

  @ApiProperty({ example: '2026-08-28' })
  @IsString()
  date: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiProperty({ required: false, example: 'Picked up early by uncle' })
  @IsOptional()
  @IsString()
  note?: string;
}
