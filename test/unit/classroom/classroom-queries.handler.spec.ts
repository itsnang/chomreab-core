import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetClassroomsHandler } from '../../../src/classroom/application/queries/get-classrooms.handler';
import { GetClassroomsQuery } from '../../../src/classroom/application/queries/get-classrooms.query';
import { GetClassroomHandler } from '../../../src/classroom/application/queries/get-classroom.handler';
import { GetClassroomQuery } from '../../../src/classroom/application/queries/get-classroom.query';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

describe('Classroom query handlers', () => {
  let listHandler: GetClassroomsHandler;
  let getHandler: GetClassroomHandler;
  let repo: { find: jest.Mock; findOneBy: jest.Mock };

  beforeEach(async () => {
    repo = { find: jest.fn(), findOneBy: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GetClassroomsHandler,
        GetClassroomHandler,
        { provide: getRepositoryToken(ClassroomEntity), useValue: repo },
      ],
    }).compile();
    listHandler = module.get(GetClassroomsHandler);
    getHandler = module.get(GetClassroomHandler);
  });

  it('lists classrooms ordered by name', async () => {
    repo.find.mockResolvedValue([{ id: '1', name: 'A' }]);
    const result = await listHandler.execute(
      new GetClassroomsQuery('school-1'),
    );
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
      where: { schoolId: 'school-1' },
    });
  });

  it('returns a single classroom', async () => {
    repo.findOneBy.mockResolvedValue({ id: '1', name: 'A' });
    const result = await getHandler.execute(
      new GetClassroomQuery('school-1', '1'),
    );
    expect(result.id).toBe('1');
  });

  it('throws NotFoundException for a missing classroom', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(
      getHandler.execute(new GetClassroomQuery('school-1', 'missing')),
    ).rejects.toThrow(NotFoundException);
  });
});
