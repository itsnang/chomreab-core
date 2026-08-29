import { Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { MarkAttendanceCommand } from './mark-attendance.command';
import { BulkMarkAttendanceCommand } from './bulk-mark-attendance.command';

@Injectable()
@CommandHandler(BulkMarkAttendanceCommand)
export class BulkMarkAttendanceHandler implements ICommandHandler<
  BulkMarkAttendanceCommand,
  AttendanceRecordEntity[]
> {
  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    command: BulkMarkAttendanceCommand,
  ): Promise<AttendanceRecordEntity[]> {
    const { studentIds, classroomId, date, status, markedByUserId } = command;
    const results: AttendanceRecordEntity[] = [];
    for (const studentId of studentIds) {
      const record = await this.commandBus.execute<
        MarkAttendanceCommand,
        AttendanceRecordEntity
      >(
        new MarkAttendanceCommand(
          studentId,
          classroomId,
          date,
          status,
          null,
          markedByUserId,
        ),
      );
      results.push(record);
    }
    return results;
  }
}
