import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GenerateLinkingCodeDto {
  @ApiProperty()
  @IsUUID()
  student_id: string;
}
