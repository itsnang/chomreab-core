import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../classroom/infrastructure/entities/classroom.entity';
import { AttendanceRecordEntity } from '../attendance/infrastructure/entities/attendance-record.entity';
import { ReportsController } from './api/controllers/reports.controller';
import { GetReportsSummaryHandler } from './application/queries/get-reports-summary.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      StudentEntity,
      ClassroomEntity,
      AttendanceRecordEntity,
    ]),
    JwtModule.register({}),
  ],
  controllers: [ReportsController],
  providers: [GetReportsSummaryHandler],
})
export class ReportsModule {}
