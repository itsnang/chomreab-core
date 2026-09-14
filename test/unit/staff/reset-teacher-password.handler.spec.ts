import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { ResetTeacherPasswordHandler } from '../../../src/staff/application/commands/reset-teacher-password.handler';
import { ResetTeacherPasswordCommand } from '../../../src/staff/application/commands/reset-teacher-password.command';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';
import { RefreshTokenEntity } from '../../../src/auth/infrastructure/entities/refresh-token.entity';

describe('ResetTeacherPasswordHandler', () => {
  let handler: ResetTeacherPasswordHandler;
  let userRepo: { findOneBy: jest.Mock; update: jest.Mock };
  let refreshTokenRepo: { delete: jest.Mock };

  beforeEach(async () => {
    userRepo = { findOneBy: jest.fn(), update: jest.fn() };
    refreshTokenRepo = { delete: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ResetTeacherPasswordHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: refreshTokenRepo,
        },
      ],
    }).compile();

    handler = module.get(ResetTeacherPasswordHandler);
  });

  it('throws NotFoundException for a missing teacher', async () => {
    userRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(new ResetTeacherPasswordCommand('nope')),
    ).rejects.toThrow(NotFoundException);
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(refreshTokenRepo.delete).not.toHaveBeenCalled();
  });

  it('scopes the lookup to teachers, so an admin cannot be reset this way', async () => {
    userRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(new ResetTeacherPasswordCommand('admin-id')),
    ).rejects.toThrow(NotFoundException);
    expect(userRepo.findOneBy).toHaveBeenCalledWith({
      id: 'admin-id',
      role: UserRole.TEACHER,
    });
  });

  it('returns the new password once, forces a change, and revokes every session', async () => {
    userRepo.findOneBy.mockResolvedValue({ id: 't1', role: UserRole.TEACHER });
    userRepo.update.mockResolvedValue(undefined);
    refreshTokenRepo.delete.mockResolvedValue(undefined);

    const result = await handler.execute(new ResetTeacherPasswordCommand('t1'));

    expect(result.temporaryPassword).toHaveLength(12);

    const [id, partial] = userRepo.update.mock.calls[0] as [
      string,
      Partial<UserEntity>,
    ];
    expect(id).toBe('t1');
    expect(partial.mustChangePassword).toBe(true);
    // The stored hash is of the password handed back, and only the hash is kept.
    expect(
      await bcrypt.compare(result.temporaryPassword, partial.passwordHash!),
    ).toBe(true);

    expect(refreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 't1' });
  });

  it('issues a different password each time', async () => {
    userRepo.findOneBy.mockResolvedValue({ id: 't1', role: UserRole.TEACHER });
    const first = await handler.execute(new ResetTeacherPasswordCommand('t1'));
    const second = await handler.execute(new ResetTeacherPasswordCommand('t1'));
    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
  });
});
