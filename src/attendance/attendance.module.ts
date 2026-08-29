import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from './infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from './infrastructure/entities/attendance-audit-log.entity';
import { AttendanceController } from './api/controllers/attendance.controller';
import { MarkAttendanceHandler } from './application/commands/mark-attendance.handler';
import { BulkMarkAttendanceHandler } from './application/commands/bulk-mark-attendance.handler';
import { GetRosterHandler } from './application/queries/get-roster.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      StudentEntity,
      AttendanceRecordEntity,
      AttendanceAuditLogEntity,
    ]),
    JwtModule.register({}),
  ],
  controllers: [AttendanceController],
  providers: [
    MarkAttendanceHandler,
    BulkMarkAttendanceHandler,
    GetRosterHandler,
  ],
})
export class AttendanceModule {}
