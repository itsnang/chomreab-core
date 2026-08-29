import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventBus } from '@nestjs/cqrs';
import { MarkAttendanceHandler } from '../../../src/attendance/application/commands/mark-attendance.handler';
import { MarkAttendanceCommand } from '../../../src/attendance/application/commands/mark-attendance.command';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../../src/attendance/infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from '../../../src/attendance/infrastructure/entities/attendance-audit-log.entity';
import { AttendanceMarkedEvent } from '../../../src/attendance/domain/events/attendance-marked.event';

describe('MarkAttendanceHandler', () => {
  let handler: MarkAttendanceHandler;
  let recordRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock };
  let auditRepo: { save: jest.Mock };
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    recordRepo = {
      findOneBy: jest.fn(),
      create: jest.fn(
        (v: Partial<AttendanceRecordEntity>) => v as AttendanceRecordEntity,
      ),
      save: jest.fn((v: AttendanceRecordEntity) => Promise.resolve(v)),
    };
    auditRepo = { save: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MarkAttendanceHandler,
        {
          provide: getRepositoryToken(AttendanceRecordEntity),
          useValue: recordRepo,
        },
        {
          provide: getRepositoryToken(AttendanceAuditLogEntity),
          useValue: auditRepo,
        },
        { provide: EventBus, useValue: eventBus },
      ],
    }).compile();

    handler = module.get(MarkAttendanceHandler);
  });

  it('creates a fresh record with no audit log when none exists yet', async () => {
    recordRepo.findOneBy.mockResolvedValue(null);

    const result = await handler.execute(
      new MarkAttendanceCommand(
        'student-1',
        'class-1',
        '2026-08-28',
        AttendanceStatus.PRESENT,
        null,
        'teacher-1',
      ),
    );

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(auditRepo.save).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(AttendanceMarkedEvent),
    );
  });

  it('writes an audit log entry when re-marking an existing record', async () => {
    recordRepo.findOneBy.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      classroomId: 'class-1',
      date: '2026-08-28',
      status: AttendanceStatus.PRESENT,
      note: null,
      markedByUserId: 'teacher-1',
    });

    const result = await handler.execute(
      new MarkAttendanceCommand(
        'student-1',
        'class-1',
        '2026-08-28',
        AttendanceStatus.ABSENT,
        'Sick',
        'teacher-2',
      ),
    );

    expect(result.status).toBe(AttendanceStatus.ABSENT);
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceRecordId: 'record-1',
        previousStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.ABSENT,
        changedByUserId: 'teacher-2',
      }),
    );
  });

  it('overwrites note and markedByUserId on the existing record when re-marking', async () => {
    recordRepo.findOneBy.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      classroomId: 'class-1',
      date: '2026-08-28',
      status: AttendanceStatus.PRESENT,
      note: null,
      markedByUserId: 'teacher-1',
    });

    const result = await handler.execute(
      new MarkAttendanceCommand(
        'student-1',
        'class-1',
        '2026-08-28',
        AttendanceStatus.LATE,
        'Bus was late',
        'teacher-2',
      ),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'record-1',
        status: AttendanceStatus.LATE,
        note: 'Bus was late',
        markedByUserId: 'teacher-2',
      }),
    );
    // Should update the existing record in place, not create a second one.
    expect(recordRepo.create).not.toHaveBeenCalled();
  });

  it('publishes an AttendanceMarkedEvent carrying the marked values', async () => {
    recordRepo.findOneBy.mockResolvedValue(null);

    await handler.execute(
      new MarkAttendanceCommand(
        'student-1',
        'class-1',
        '2026-08-28',
        AttendanceStatus.LATE,
        'Traffic',
        'teacher-1',
      ),
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        classroomId: 'class-1',
        date: '2026-08-28',
        status: AttendanceStatus.LATE,
        note: 'Traffic',
      }),
    );
  });
});
