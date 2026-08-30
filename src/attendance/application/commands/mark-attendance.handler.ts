import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from '../../infrastructure/entities/attendance-audit-log.entity';
import { AttendanceMarkedEvent } from '../../domain/events/attendance-marked.event';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
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
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: MarkAttendanceCommand,
  ): Promise<AttendanceRecordEntity> {
    const { studentId, date, status, note, markedByUserId } = command;

    const student = await this.studentRepository.findOneBy({ id: studentId });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    // The submitted classroom_id is not trusted — the student's actual
    // classroom is the source of truth, so a stale/incorrect classroom_id
    // from the caller can't create a record that silently never appears on
    // any roster.
    const classroomId = student.classroomId;

    let existing = await this.recordRepository.findOneBy({ studentId, date });

    let record: AttendanceRecordEntity;
    if (existing) {
      record = await this.updateAndAudit(
        existing,
        status,
        note,
        markedByUserId,
      );
    } else {
      try {
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
      } catch (error) {
        // Handle race condition: another request won the unique-constraint race
        // Re-fetch the now-existing record and treat as edit
        if (
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === '23505'
        ) {
          existing = await this.recordRepository.findOneBy({ studentId, date });
          if (existing) {
            record = await this.updateAndAudit(
              existing,
              status,
              note,
              markedByUserId,
            );
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    this.eventBus.publish(
      new AttendanceMarkedEvent(studentId, classroomId, date, status, note),
    );

    return record;
  }

  private async updateAndAudit(
    record: AttendanceRecordEntity,
    status: AttendanceStatus,
    note: string | null,
    markedByUserId: string,
  ): Promise<AttendanceRecordEntity> {
    // Re-marking the same student on the same day is an edit — keep an audit
    // trail of who changed it and what it changed from/to.
    await this.auditRepository.save({
      id: crypto.randomUUID(),
      attendanceRecordId: record.id,
      changedByUserId: markedByUserId,
      previousStatus: record.status,
      newStatus: status,
    });
    record.status = status;
    record.note = note;
    record.markedByUserId = markedByUserId;
    return this.recordRepository.save(record);
  }
}
