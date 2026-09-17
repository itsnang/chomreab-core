import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetStudentsHandler } from '../../../src/student/application/queries/get-students.handler';
import { StudentStatus } from '../../../src/student/infrastructure/entities/student.entity';
import { GetStudentsQuery } from '../../../src/student/application/queries/get-students.query';
import { GetStudentHandler } from '../../../src/student/application/queries/get-student.handler';
import { GetStudentQuery } from '../../../src/student/application/queries/get-student.query';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';

describe('Student query handlers', () => {
  let listHandler: GetStudentsHandler;
  let getHandler: GetStudentHandler;
  let repo: { find: jest.Mock; findOneBy: jest.Mock };

  beforeEach(async () => {
    repo = { find: jest.fn(), findOneBy: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GetStudentsHandler,
        GetStudentHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: repo },
      ],
    }).compile();
    listHandler = module.get(GetStudentsHandler);
    getHandler = module.get(GetStudentHandler);
  });

  it('lists active students ordered by name', async () => {
    repo.find.mockResolvedValue([{ id: '1', name: 'A' }]);
    const result = await listHandler.execute(new GetStudentsQuery('school-1'));
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({
      where: { status: StudentStatus.ACTIVE, schoolId: 'school-1' },
      order: { name: 'ASC' },
    });
  });

  it('filters by classroom_id when provided', async () => {
    repo.find.mockResolvedValue([]);
    await listHandler.execute(new GetStudentsQuery('school-1', 'classroom-1'));
    expect(repo.find).toHaveBeenCalledWith({
      where: {
        classroomId: 'classroom-1',
        status: StudentStatus.ACTIVE,
        schoolId: 'school-1',
      },
      order: { name: 'ASC' },
    });
  });

  it('includes students who have left when asked to', async () => {
    repo.find.mockResolvedValue([]);
    await listHandler.execute(
      new GetStudentsQuery('school-1', undefined, true),
    );
    expect(repo.find).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
      order: { name: 'ASC' },
    });
  });

  it('returns a single student', async () => {
    repo.findOneBy.mockResolvedValue({ id: '1', name: 'A' });
    const result = await getHandler.execute(
      new GetStudentQuery('school-1', '1'),
    );
    expect(result.id).toBe('1');
  });

  it('throws NotFoundException for a missing student', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(
      getHandler.execute(new GetStudentQuery('school-1', 'missing')),
    ).rejects.toThrow(NotFoundException);
  });
});
