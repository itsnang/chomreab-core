import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateStudentHandler } from '../../../src/student/application/commands/create-student.handler';
import { CreateStudentCommand } from '../../../src/student/application/commands/create-student.command';
import { UpdateStudentHandler } from '../../../src/student/application/commands/update-student.handler';
import { UpdateStudentCommand } from '../../../src/student/application/commands/update-student.command';
import { DeleteStudentHandler } from '../../../src/student/application/commands/delete-student.handler';
import { DeleteStudentCommand } from '../../../src/student/application/commands/delete-student.command';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';

describe('Student command handlers', () => {
  let createHandler: CreateStudentHandler;
  let updateHandler: UpdateStudentHandler;
  let deleteHandler: DeleteStudentHandler;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v: Partial<StudentEntity>) => v as StudentEntity),
      save: jest.fn((v: StudentEntity) => Promise.resolve(v)),
      findOneBy: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreateStudentHandler,
        UpdateStudentHandler,
        DeleteStudentHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: repo },
      ],
    }).compile();

    createHandler = module.get(CreateStudentHandler);
    updateHandler = module.get(UpdateStudentHandler);
    deleteHandler = module.get(DeleteStudentHandler);
  });

  it('creates a student', async () => {
    const result = await createHandler.execute(
      new CreateStudentCommand('school-1', 'Sokha', 'classroom-1'),
    );
    expect(result.name).toBe('Sokha');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('updates an existing student', async () => {
    repo.findOneBy.mockResolvedValue({
      id: '1',
      name: 'Old',
      classroomId: 'classroom-1',
      status: 'active',
    });
    const result = await updateHandler.execute(
      new UpdateStudentCommand('school-1', '1', 'New Name'),
    );
    expect(result.name).toBe('New Name');
  });

  it('throws NotFoundException updating a missing student', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(
      updateHandler.execute(
        new UpdateStudentCommand('school-1', 'missing', 'X'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing student', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(
      deleteHandler.execute(new DeleteStudentCommand('school-1', '1')),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundException deleting a missing student', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(
      deleteHandler.execute(new DeleteStudentCommand('school-1', 'missing')),
    ).rejects.toThrow(NotFoundException);
  });
});
