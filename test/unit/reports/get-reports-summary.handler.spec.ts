import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between } from 'typeorm';
import { GetReportsSummaryHandler } from '../../../src/reports/application/queries/get-reports-summary.handler';
import { GetReportsSummaryQuery } from '../../../src/reports/application/queries/get-reports-summary.query';
import {
  StudentEntity,
  StudentStatus,
} from '../../../src/student/infrastructure/entities/student.entity';
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
      {
        id: 's1',
        name: 'Sokha',
        classroomId: 'c1',
        status: StudentStatus.ACTIVE,
      },
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
      {
        id: 's1',
        name: 'Sokha',
        classroomId: 'c1',
        status: StudentStatus.ACTIVE,
      },
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

  it('scopes the attendance query to the 20-day window at the DB level', async () => {
    studentRepo.find.mockResolvedValue([
      {
        id: 's1',
        name: 'Sokha',
        classroomId: 'c1',
        status: StudentStatus.ACTIVE,
      },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: null },
    ]);
    // A real query scoped to the window would never return a record dated
    // outside it (e.g. 2026-07-01), so the mock reflects that by resolving
    // with no records for this window.
    recordRepo.find.mockResolvedValue([]);

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );

    expect(recordRepo.find).toHaveBeenCalledWith({
      where: { date: Between('2026-08-09', '2026-08-28') },
    });
    expect(result.studentRows[0]).toMatchObject({ absent: 0, chronic: false });
  });

  it("summarizes today's marks per class including unmarked count", async () => {
    studentRepo.find.mockResolvedValue([
      {
        id: 's1',
        name: 'Sokha',
        classroomId: 'c1',
        status: StudentStatus.ACTIVE,
      },
      {
        id: 's2',
        name: 'Dara',
        classroomId: 'c1',
        status: StudentStatus.ACTIVE,
      },
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

  it('attributes a transferred student to the classroom each record was taken in', async () => {
    // Dara moved c1 -> c2 mid-window. February's marks must stay with c1.
    studentRepo.find.mockResolvedValue([
      {
        id: 's1',
        name: 'Dara',
        classroomId: 'c2',
        status: StudentStatus.ACTIVE,
      },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A' },
      { id: 'c2', name: 'Grade 3B' },
    ]);
    recordRepo.find.mockResolvedValue([
      {
        studentId: 's1',
        classroomId: 'c1',
        date: '2026-08-20',
        status: AttendanceStatus.ABSENT,
      },
      {
        studentId: 's1',
        classroomId: 'c2',
        date: '2026-08-28',
        status: AttendanceStatus.PRESENT,
      },
    ]);

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );

    expect(result.studentRows).toHaveLength(2);
    const old = result.studentRows.find((r) => r.classroomId === 'c1');
    const current = result.studentRows.find((r) => r.classroomId === 'c2');
    expect(old).toMatchObject({
      classroomName: 'Grade 3A',
      absent: 1,
      present: 0,
    });
    expect(current).toMatchObject({
      classroomName: 'Grade 3B',
      present: 1,
      absent: 0,
    });
  });

  it('counts a chronic absentee once, even when their absences span two classrooms', async () => {
    studentRepo.find.mockResolvedValue([
      {
        id: 's1',
        name: 'Dara',
        classroomId: 'c2',
        status: StudentStatus.ACTIVE,
      },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A' },
      { id: 'c2', name: 'Grade 3B' },
    ]);
    // Two absences in each class: chronic overall, but neither row alone hits
    // the threshold of three.
    recordRepo.find.mockResolvedValue(
      ['c1', 'c1', 'c2', 'c2'].map((classroomId, i) => ({
        studentId: 's1',
        classroomId,
        date: `2026-08-2${i}`,
        status: AttendanceStatus.ABSENT,
      })),
    );

    const result = await handler.execute(
      new GetReportsSummaryQuery('2026-08-28'),
    );

    expect(result.chronicCount).toBe(1);
    expect(result.studentRows.every((r) => r.chronic)).toBe(true);
  });

  it('never reports a negative unmarked count when a marked student is deactivated', async () => {
    studentRepo.find.mockResolvedValue([
      {
        id: 's1',
        name: 'Gone',
        classroomId: 'c1',
        status: StudentStatus.INACTIVE,
      },
    ]);
    classroomRepo.find.mockResolvedValue([{ id: 'c1', name: 'Grade 3A' }]);
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

    expect(result.dailySummary[0]).toMatchObject({ present: 1, unmarked: 0 });
    // Their attendance still happened, so the historical row survives.
    expect(result.studentRows).toHaveLength(1);
  });
});
