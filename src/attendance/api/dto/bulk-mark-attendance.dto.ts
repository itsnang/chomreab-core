import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsEnum, IsString, IsUUID } from 'class-validator';
import { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class BulkMarkAttendanceDto {
  @ApiProperty({ type: [String] })
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  student_ids: string[];

  @ApiProperty()
  @IsUUID()
  classroom_id: string;

  @ApiProperty({ example: '2026-08-28' })
  @IsString()
  date: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}
