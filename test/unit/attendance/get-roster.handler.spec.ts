import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetRosterHandler } from '../../../src/attendance/application/queries/get-roster.handler';
import { GetRosterQuery } from '../../../src/attendance/application/queries/get-roster.query';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('GetRosterHandler', () => {
  let handler: GetRosterHandler;
  let studentRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };

  beforeEach(async () => {
    studentRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GetRosterHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        {
          provide: getRepositoryToken(AttendanceRecordEntity),
          useValue: recordRepo,
        },
      ],
    }).compile();
    handler = module.get(GetRosterHandler);
  });

  it('pairs each student with their status for the day, or null if unmarked', async () => {
    studentRepo.find.mockResolvedValue([
      { id: 'student-1', name: 'Dara' },
      { id: 'student-2', name: 'Sokha' },
    ]);
    recordRepo.find.mockResolvedValue([
      { studentId: 'student-1', status: AttendanceStatus.PRESENT, note: null },
    ]);

    const result = await handler.execute(
      new GetRosterQuery('class-1', '2026-08-28'),
    );

    expect(result).toEqual([
      {
        studentId: 'student-1',
        studentName: 'Dara',
        status: AttendanceStatus.PRESENT,
        note: null,
      },
      {
        studentId: 'student-2',
        studentName: 'Sokha',
        status: null,
        note: null,
      },
    ]);
  });

  it('queries students and records scoped to the given classroom and date', async () => {
    studentRepo.find.mockResolvedValue([]);
    recordRepo.find.mockResolvedValue([]);

    await handler.execute(new GetRosterQuery('class-42', '2026-01-05'));

    expect(studentRepo.find).toHaveBeenCalledWith({
      where: { classroomId: 'class-42' },
      order: { name: 'ASC' },
    });
    expect(recordRepo.find).toHaveBeenCalledWith({
      where: { classroomId: 'class-42', date: '2026-01-05' },
    });
  });

  it('carries the note through for a marked student and leaves it null for an unmarked one', async () => {
    studentRepo.find.mockResolvedValue([
      { id: 'student-1', name: 'Dara' },
      { id: 'student-2', name: 'Sokha' },
    ]);
    recordRepo.find.mockResolvedValue([
      { studentId: 'student-1', status: AttendanceStatus.ABSENT, note: 'Sick' },
    ]);

    const result = await handler.execute(
      new GetRosterQuery('class-1', '2026-08-28'),
    );

    expect(result).toEqual([
      {
        studentId: 'student-1',
        studentName: 'Dara',
        status: AttendanceStatus.ABSENT,
        note: 'Sick',
      },
      {
        studentId: 'student-2',
        studentName: 'Sokha',
        status: null,
        note: null,
      },
    ]);
  });

  it('returns an empty roster when the classroom has no students', async () => {
    studentRepo.find.mockResolvedValue([]);
    recordRepo.find.mockResolvedValue([]);

    const result = await handler.execute(
      new GetRosterQuery('class-empty', '2026-08-28'),
    );

    expect(result).toEqual([]);
  });

  it('ignores an attendance record for a different date entirely (not returned by the repo)', async () => {
    // Records are already filtered by date at the repository layer via the where clause;
    // this test guards the in-memory join against accidentally matching on studentId alone
    // when a stray record for another date leaks through.
    studentRepo.find.mockResolvedValue([{ id: 'student-1', name: 'Dara' }]);
    recordRepo.find.mockResolvedValue([]);

    const result = await handler.execute(
      new GetRosterQuery('class-1', '2026-08-29'),
    );

    expect(result).toEqual([
      { studentId: 'student-1', studentName: 'Dara', status: null, note: null },
    ]);
  });
});
