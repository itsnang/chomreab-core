import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetMyClassesTodayHandler } from '../../../src/attendance/application/queries/get-my-classes-today.handler';
import { GetMyClassesTodayQuery } from '../../../src/attendance/application/queries/get-my-classes-today.query';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('GetMyClassesTodayHandler', () => {
  let handler: GetMyClassesTodayHandler;
  let classroomRepo: { find: jest.Mock };
  let studentRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };

  beforeEach(async () => {
    classroomRepo = { find: jest.fn() };
    studentRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetMyClassesTodayHandler,
        {
          provide: getRepositoryToken(ClassroomEntity),
          useValue: classroomRepo,
        },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        {
          provide: getRepositoryToken(AttendanceRecordEntity),
          useValue: recordRepo,
        },
      ],
    }).compile();

    handler = module.get(GetMyClassesTodayHandler);
  });

  it("returns unmarked counts for the teacher's own classrooms only", async () => {
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', gradeLabel: 'Grade 3', teacherId: 't1' },
    ]);
    studentRepo.find.mockResolvedValue([
      { id: 's1', classroomId: 'c1' },
      { id: 's2', classroomId: 'c1' },
    ]);
    recordRepo.find.mockResolvedValue([
      { studentId: 's1', date: '2026-08-28' },
    ]);

    const result = await handler.execute(
      new GetMyClassesTodayQuery('t1', '2026-08-28'),
    );
    expect(result).toEqual([
      {
        classroomId: 'c1',
        name: 'Grade 3A',
        gradeLabel: 'Grade 3',
        studentCount: 2,
        unmarkedCount: 1,
      },
    ]);
  });

  it('returns an empty array when the teacher has no classrooms', async () => {
    classroomRepo.find.mockResolvedValue([]);
    const result = await handler.execute(
      new GetMyClassesTodayQuery('t1', '2026-08-28'),
    );
    expect(result).toEqual([]);
    expect(studentRepo.find).not.toHaveBeenCalled();
  });
});
