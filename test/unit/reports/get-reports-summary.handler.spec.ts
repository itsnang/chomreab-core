import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetReportsSummaryHandler } from '../../../src/reports/application/queries/get-reports-summary.handler';
import { GetReportsSummaryQuery } from '../../../src/reports/application/queries/get-reports-summary.query';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('GetReportsSummaryHandler', () => {
  let handler: GetReportsSummaryHandler;
  let studentRepo: { find: jest.Mock };
  let classroomRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };

  beforeEach(async () => {
    studentRepo = { find: jest.fn() };
    classroomRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetReportsSummaryHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        {
          provide: getRepositoryToken(ClassroomEntity),
          useValue: classroomRepo,
        },
        {
          provide: getRepositoryToken(AttendanceRecordEntity),
          useValue: recordRepo,
        },
      ],
    }).compile();

    handler = module.get(GetReportsSummaryHandler);
  });

  it('flags a student as chronic at 3 or more absences in the window', async () => {
    studentRepo.find.mockResolvedValue([
      { id: 's1', name: 'Sokha', classroomId: 'c1' },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: null },
    ]);
    recordRepo.find.mockResolvedValue([
      {
        studentId: 's1',
        classroomId: 'c1',
        date: '2026-08-26',
        status: AttendanceStatus.ABSENT,
      },
      {
        studentId: 's1',
        classroomId: 'c1',
        date: '2026-08-27',
        status: AttendanceStatus.ABSENT,
      },
      {
        studentId: 's1',
        classroomId: 'c1',
        date: '2026-08-28',
        status: AttendanceStatus.ABSENT,
      },
    ]);

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );
    expect(result.studentRows[0]).toMatchObject({ absent: 3, chronic: true });
    expect(result.chronicCount).toBe(1);
  });

  it('gives a student with no records yet a 100% rate and non-chronic status', async () => {
    studentRepo.find.mockResolvedValue([
      { id: 's1', name: 'Sokha', classroomId: 'c1' },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: null },
    ]);
    recordRepo.find.mockResolvedValue([]);

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );
    expect(result.studentRows[0]).toMatchObject({
      ratePct: 100,
      chronic: false,
    });
    expect(result.overallRatePct).toBe(100);
  });

  it("excludes records outside the 20-day window from a student's counts", async () => {
    studentRepo.find.mockResolvedValue([
      { id: 's1', name: 'Sokha', classroomId: 'c1' },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: null },
    ]);
    recordRepo.find.mockResolvedValue([
      {
        studentId: 's1',
        classroomId: 'c1',
        date: '2026-07-01',
        status: AttendanceStatus.ABSENT,
      },
    ]);

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );
    expect(result.studentRows[0]).toMatchObject({ absent: 0, chronic: false });
  });

  it("summarizes today's marks per class including unmarked count", async () => {
    studentRepo.find.mockResolvedValue([
      { id: 's1', name: 'Sokha', classroomId: 'c1' },
      { id: 's2', name: 'Dara', classroomId: 'c1' },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: null },
    ]);
    recordRepo.find.mockResolvedValue([
      {
        studentId: 's1',
        classroomId: 'c1',
        date: '2026-08-28',
        status: AttendanceStatus.PRESENT,
      },
    ]);

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );
    expect(result.dailySummary[0]).toEqual({
      classroomId: 'c1',
      classroomName: 'Grade 3A',
      present: 1,
      late: 0,
      absent: 0,
      unmarked: 1,
    });
  });
});
