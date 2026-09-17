import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class UpdateSchoolSettingsDto {
  @ApiProperty({ example: 'Rise Tutoring Center' })
  @IsString()
  @MinLength(1)
  school_name: string;

  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(0)
  late_cutoff_minutes: number;

  @ApiProperty({ example: '{{student_name}} was marked absent today.' })
  @IsString()
  @MinLength(1)
  absence_message_template: string;
}
