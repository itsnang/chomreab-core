import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateClassroomHandler } from '../../../src/classroom/application/commands/create-classroom.handler';
import { CreateClassroomCommand } from '../../../src/classroom/application/commands/create-classroom.command';
import { UpdateClassroomHandler } from '../../../src/classroom/application/commands/update-classroom.handler';
import { UpdateClassroomCommand } from '../../../src/classroom/application/commands/update-classroom.command';
import { DeleteClassroomHandler } from '../../../src/classroom/application/commands/delete-classroom.handler';
import { DeleteClassroomCommand } from '../../../src/classroom/application/commands/delete-classroom.command';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

describe('Classroom command handlers', () => {
  let createHandler: CreateClassroomHandler;
  let updateHandler: UpdateClassroomHandler;
  let deleteHandler: DeleteClassroomHandler;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v: Partial<ClassroomEntity>) => v as ClassroomEntity),
      save: jest.fn((v: ClassroomEntity) => Promise.resolve(v)),
      findOneBy: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreateClassroomHandler,
        UpdateClassroomHandler,
        DeleteClassroomHandler,
        { provide: getRepositoryToken(ClassroomEntity), useValue: repo },
      ],
    }).compile();

    createHandler = module.get(CreateClassroomHandler);
    updateHandler = module.get(UpdateClassroomHandler);
    deleteHandler = module.get(DeleteClassroomHandler);
  });

  it('creates a classroom', async () => {
    const result = await createHandler.execute(
      new CreateClassroomCommand('school-1', 'Grade 3A', 'Grade 3', null),
    );
    expect(result.name).toBe('Grade 3A');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('updates an existing classroom', async () => {
    repo.findOneBy.mockResolvedValue({
      id: '1',
      name: 'Old',
      gradeLabel: null,
      teacherId: null,
    });
    const result = await updateHandler.execute(
      new UpdateClassroomCommand('school-1', '1', 'New Name'),
    );
    expect(result.name).toBe('New Name');
  });

  it('throws NotFoundException updating a missing classroom', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(
      updateHandler.execute(
        new UpdateClassroomCommand('school-1', 'missing', 'X'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing classroom', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(
      deleteHandler.execute(new DeleteClassroomCommand('school-1', '1')),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundException deleting a missing classroom', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(
      deleteHandler.execute(new DeleteClassroomCommand('school-1', 'missing')),
    ).rejects.toThrow(NotFoundException);
  });
});
