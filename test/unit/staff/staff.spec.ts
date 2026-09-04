import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateTeacherHandler } from '../../../src/staff/application/commands/create-teacher.handler';
import { CreateTeacherCommand } from '../../../src/staff/application/commands/create-teacher.command';
import { DeleteTeacherHandler } from '../../../src/staff/application/commands/delete-teacher.handler';
import { DeleteTeacherCommand } from '../../../src/staff/application/commands/delete-teacher.command';
import { GetTeachersHandler } from '../../../src/staff/application/queries/get-teachers.handler';
import { GetTeachersQuery } from '../../../src/staff/application/queries/get-teachers.query';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

describe('Staff command handlers', () => {
  let createHandler: CreateTeacherHandler;
  let deleteHandler: DeleteTeacherHandler;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v: Partial<UserEntity>) => v as UserEntity),
      save: jest.fn((v: UserEntity) => Promise.resolve(v)),
      findOneBy: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreateTeacherHandler,
        DeleteTeacherHandler,
        { provide: getRepositoryToken(UserEntity), useValue: repo },
      ],
    }).compile();

    createHandler = module.get(CreateTeacherHandler);
    deleteHandler = module.get(DeleteTeacherHandler);
  });

  it('creates a teacher with a temporary password', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await createHandler.execute(
      new CreateTeacherCommand('Chenda Ly', 'chenda@school.edu'),
    );
    expect(result.email).toBe('chenda@school.edu');
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.TEACHER }),
    );
  });

  it('rejects a duplicate email', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'existing' });
    await expect(
      createHandler.execute(
        new CreateTeacherCommand('Dup', 'taken@school.edu'),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('deletes a teacher', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(
      deleteHandler.execute(new DeleteTeacherCommand('1')),
    ).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith({
      id: '1',
      role: UserRole.TEACHER,
    });
  });

  it('throws NotFoundException deleting a missing teacher', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(
      deleteHandler.execute(new DeleteTeacherCommand('missing')),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GetTeachersHandler', () => {
  let handler: GetTeachersHandler;
  let userRepo: { find: jest.Mock };
  let classroomRepo: { find: jest.Mock };

  beforeEach(async () => {
    userRepo = { find: jest.fn() };
    classroomRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetTeachersHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(ClassroomEntity),
          useValue: classroomRepo,
        },
      ],
    }).compile();

    handler = module.get(GetTeachersHandler);
  });

  it("attaches each teacher's assigned classroom names", async () => {
    userRepo.find.mockResolvedValue([
      {
        id: 't1',
        name: 'Chenda',
        email: 'chenda@x.com',
        role: UserRole.TEACHER,
      },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: 't1' },
      { id: 'c2', name: 'Grade 5B', teacherId: 'other' },
    ]);

    const result = await handler.execute(new GetTeachersQuery());
    expect(result).toEqual([
      {
        id: 't1',
        name: 'Chenda',
        email: 'chenda@x.com',
        classroomNames: ['Grade 3A'],
      },
    ]);
  });
});
