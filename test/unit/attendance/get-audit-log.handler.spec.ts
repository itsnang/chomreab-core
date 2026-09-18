import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetAuditLogHandler } from '../../../src/attendance/application/queries/get-audit-log.handler';
import { GetAuditLogQuery } from '../../../src/attendance/application/queries/get-audit-log.query';
import { AttendanceAuditLogEntity } from '../../../src/attendance/infrastructure/entities/attendance-audit-log.entity';
import { AttendanceRecordEntity } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { UserEntity } from '../../../src/shared/entities/user.entity';

describe('GetAuditLogHandler', () => {
  let handler: GetAuditLogHandler;
  let auditRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };
  let studentRepo: { find: jest.Mock };
  let userRepo: { find: jest.Mock };

  beforeEach(async () => {
    auditRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };
    studentRepo = { find: jest.fn() };
    userRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetAuditLogHandler,
        {
          provide: getRepositoryToken(AttendanceAuditLogEntity),
          useValue: auditRepo,
        },
        {
          provide: getRepositoryToken(AttendanceRecordEntity),
          useValue: recordRepo,
        },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();

    handler = module.get(GetAuditLogHandler);
  });

  it('joins audit entries to student and user names', async () => {
    recordRepo.find.mockResolvedValue([
      { id: 'r1', studentId: 's1', classroomId: 'c1', date: '2026-08-28' },
    ]);
    auditRepo.find.mockResolvedValue([
      {
        attendanceRecordId: 'r1',
        changedByUserId: 'u1',
        previousStatus: 'present',
        newStatus: 'late',
        changedAt: new Date('2026-08-28T08:10:00Z'),
      },
    ]);
    studentRepo.find.mockResolvedValue([{ id: 's1', name: 'Sokha' }]);
    userRepo.find.mockResolvedValue([{ id: 'u1', name: 'Chenda' }]);

    const result = await handler.execute(
      new GetAuditLogQuery('school-1', 'c1', '2026-08-28'),
    );
    expect(result).toEqual([
      {
        changedAt: new Date('2026-08-28T08:10:00Z'),
        studentName: 'Sokha',
        changedByName: 'Chenda',
        previousStatus: 'present',
        newStatus: 'late',
      },
    ]);
  });

  it('returns an empty array when there are no attendance records for the day', async () => {
    recordRepo.find.mockResolvedValue([]);
    const result = await handler.execute(
      new GetAuditLogQuery('school-1', 'c1', '2026-08-28'),
    );
    expect(result).toEqual([]);
    expect(auditRepo.find).not.toHaveBeenCalled();
  });
});
