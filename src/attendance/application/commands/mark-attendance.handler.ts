import { Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from '../../infrastructure/entities/attendance-audit-log.entity';
import { AttendanceMarkedEvent } from '../../domain/events/attendance-marked.event';
import { MarkAttendanceCommand } from './mark-attendance.command';

@Injectable()
@CommandHandler(MarkAttendanceCommand)
export class MarkAttendanceHandler implements ICommandHandler<
  MarkAttendanceCommand,
  AttendanceRecordEntity
> {
  constructor(
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
    @InjectRepository(AttendanceAuditLogEntity)
    private readonly auditRepository: Repository<AttendanceAuditLogEntity>,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: MarkAttendanceCommand,
  ): Promise<AttendanceRecordEntity> {
    const { studentId, classroomId, date, status, note, markedByUserId } =
      command;

    const existing = await this.recordRepository.findOneBy({ studentId, date });

    let record: AttendanceRecordEntity;
    if (existing) {
      // Re-marking the same student on the same day is an edit — keep an audit
      // trail of who changed it and what it changed from/to.
      await this.auditRepository.save({
        id: crypto.randomUUID(),
        attendanceRecordId: existing.id,
        changedByUserId: markedByUserId,
        previousStatus: existing.status,
        newStatus: status,
      });
      existing.status = status;
      existing.note = note;
      existing.markedByUserId = markedByUserId;
      record = await this.recordRepository.save(existing);
    } else {
      record = await this.recordRepository.save(
        this.recordRepository.create({
          id: crypto.randomUUID(),
          studentId,
          classroomId,
          date,
          status,
          note,
          markedByUserId,
        }),
      );
    }

    this.eventBus.publish(
      new AttendanceMarkedEvent(studentId, classroomId, date, status, note),
    );

    return record;
  }
}
