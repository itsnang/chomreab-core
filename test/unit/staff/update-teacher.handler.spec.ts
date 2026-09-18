import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { UpdateTeacherHandler } from '../../../src/staff/application/commands/update-teacher.handler';
import { UpdateTeacherCommand } from '../../../src/staff/application/commands/update-teacher.command';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';

describe('UpdateTeacherHandler', () => {
  let handler: UpdateTeacherHandler;
  let userRepo: { findOneBy: jest.Mock; save: jest.Mock };

  const existing = () => ({
    id: 't1',
    name: 'Chenda Ly',
    email: 'chenda@school.edu',
    role: UserRole.TEACHER,
  });

  beforeEach(async () => {
    userRepo = { findOneBy: jest.fn(), save: jest.fn((u: UserEntity) => u) };

    const module = await Test.createTestingModule({
      providers: [
        UpdateTeacherHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();

    handler = module.get(UpdateTeacherHandler);
  });

  it('throws NotFoundException for a missing teacher', async () => {
    userRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(new UpdateTeacherCommand('school-1', 'nope', 'New Name')),
    ).rejects.toThrow(NotFoundException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    userRepo.findOneBy.mockResolvedValue(existing());
    const result = await handler.execute(
      new UpdateTeacherCommand('school-1', 't1', 'Chenda Lim'),
    );
    expect(result.name).toBe('Chenda Lim');
    expect(result.email).toBe('chenda@school.edu');
  });

  it('rejects an email already held by another account', async () => {
    userRepo.findOneBy
      .mockResolvedValueOnce(existing())
      .mockResolvedValueOnce({ id: 'other', email: 'taken@school.edu' });

    await expect(
      handler.execute(
        new UpdateTeacherCommand(
          'school-1',
          't1',
          undefined,
          'taken@school.edu',
        ),
      ),
    ).rejects.toThrow(ConflictException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('excludes the teacher themselves from the uniqueness check', async () => {
    userRepo.findOneBy
      .mockResolvedValueOnce(existing())
      .mockResolvedValueOnce(null);

    await handler.execute(
      new UpdateTeacherCommand('school-1', 't1', undefined, 'new@school.edu'),
    );

    expect(userRepo.findOneBy).toHaveBeenLastCalledWith({
      email: 'new@school.edu',
      id: Not('t1'),
      schoolId: 'school-1',
    });
  });

  it('does not run the uniqueness check when the email is unchanged', async () => {
    userRepo.findOneBy.mockResolvedValue(existing());
    await handler.execute(
      new UpdateTeacherCommand(
        'school-1',
        't1',
        undefined,
        'chenda@school.edu',
      ),
    );
    expect(userRepo.findOneBy).toHaveBeenCalledTimes(1);
  });
});
