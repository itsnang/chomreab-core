import { Test } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { BulkMarkAttendanceHandler } from '../../../src/attendance/application/commands/bulk-mark-attendance.handler';
import { BulkMarkAttendanceCommand } from '../../../src/attendance/application/commands/bulk-mark-attendance.command';
import { MarkAttendanceCommand } from '../../../src/attendance/application/commands/mark-attendance.command';
import { AttendanceStatus } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('BulkMarkAttendanceHandler', () => {
  let handler: BulkMarkAttendanceHandler;
  let commandBus: { execute: jest.Mock };

  beforeEach(async () => {
    commandBus = { execute: jest.fn().mockResolvedValue({ id: 'record' }) };
    const module = await Test.createTestingModule({
      providers: [
        BulkMarkAttendanceHandler,
        { provide: CommandBus, useValue: commandBus },
      ],
    }).compile();
    handler = module.get(BulkMarkAttendanceHandler);
  });

  it('dispatches one MarkAttendanceCommand per student', async () => {
    const result = await handler.execute(
      new BulkMarkAttendanceCommand(
        ['student-1', 'student-2'],
        'class-1',
        '2026-08-28',
        AttendanceStatus.PRESENT,
        'teacher-1',
      ),
    );

    expect(result).toHaveLength(2);
    expect(commandBus.execute).toHaveBeenCalledTimes(2);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining(
        new MarkAttendanceCommand(
          'student-1',
          'class-1',
          '2026-08-28',
          AttendanceStatus.PRESENT,
          null,
          'teacher-1',
        ),
      ),
    );
  });

  it('dispatches each per-student command via MarkAttendanceCommand, not duplicated upsert logic', async () => {
    await handler.execute(
      new BulkMarkAttendanceCommand(
        ['student-1', 'student-2', 'student-3'],
        'class-1',
        '2026-08-28',
        AttendanceStatus.ABSENT,
        'teacher-9',
      ),
    );

    const dispatched: MarkAttendanceCommand[] =
      commandBus.execute.mock.calls.map(
        (call: unknown[]) => call[0] as MarkAttendanceCommand,
      );
    expect(dispatched).toHaveLength(3);
    for (const cmd of dispatched) {
      expect(cmd).toBeInstanceOf(MarkAttendanceCommand);
    }
    expect(dispatched.map((c) => c.studentId)).toEqual([
      'student-1',
      'student-2',
      'student-3',
    ]);
    // note is always null for bulk-marking — per-student notes require the single-mark flow.
    for (const cmd of dispatched) {
      expect(cmd.classroomId).toBe('class-1');
      expect(cmd.date).toBe('2026-08-28');
      expect(cmd.status).toBe(AttendanceStatus.ABSENT);
      expect(cmd.markedByUserId).toBe('teacher-9');
      expect(cmd.note).toBeNull();
    }
  });

  it('collects the results returned by each dispatched command in order', async () => {
    commandBus.execute
      .mockResolvedValueOnce({ id: 'record-1', studentId: 'student-1' })
      .mockResolvedValueOnce({ id: 'record-2', studentId: 'student-2' });

    const result = await handler.execute(
      new BulkMarkAttendanceCommand(
        ['student-1', 'student-2'],
        'class-1',
        '2026-08-28',
        AttendanceStatus.PRESENT,
        'teacher-1',
      ),
    );

    expect(result).toEqual([
      { id: 'record-1', studentId: 'student-1' },
      { id: 'record-2', studentId: 'student-2' },
    ]);
  });

  it('returns an empty array and dispatches nothing for an empty student list', async () => {
    const result = await handler.execute(
      new BulkMarkAttendanceCommand(
        [],
        'class-1',
        '2026-08-28',
        AttendanceStatus.PRESENT,
        'teacher-1',
      ),
    );

    expect(result).toEqual([]);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
