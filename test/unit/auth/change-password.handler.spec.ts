import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { ChangePasswordHandler } from '../../../src/auth/application/commands/change-password.handler';
import { ChangePasswordCommand } from '../../../src/auth/application/commands/change-password.command';
import { UserEntity } from '../../../src/shared/entities/user.entity';
import { RefreshTokenEntity } from '../../../src/auth/infrastructure/entities/refresh-token.entity';

describe('ChangePasswordHandler', () => {
  let handler: ChangePasswordHandler;
  let userRepo: { findOne: jest.Mock; update: jest.Mock };
  let refreshTokenRepo: { delete: jest.Mock };
  let currentHash: string;

  const CURRENT = 'currentPassword123';
  const NEXT = 'newPassword456';

  beforeEach(async () => {
    currentHash = await bcrypt.hash(CURRENT, 4);
    userRepo = { findOne: jest.fn(), update: jest.fn() };
    refreshTokenRepo = { delete: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ChangePasswordHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: refreshTokenRepo,
        },
      ],
    }).compile();

    handler = module.get(ChangePasswordHandler);
  });

  it('throws UnauthorizedException when the user no longer exists', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      handler.execute(new ChangePasswordCommand('user-id', CURRENT, NEXT)),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the current password is wrong', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-id',
      passwordHash: currentHash,
    });
    await expect(
      handler.execute(new ChangePasswordCommand('user-id', 'wrong', NEXT)),
    ).rejects.toThrow(
      new UnauthorizedException('Current password is incorrect'),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(refreshTokenRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects a new password identical to the current one', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-id',
      passwordHash: currentHash,
    });
    await expect(
      handler.execute(new ChangePasswordCommand('user-id', CURRENT, CURRENT)),
    ).rejects.toThrow(
      new BadRequestException('New password must differ from the current one'),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('asks for passwordHash explicitly, since the column is select:false', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      handler.execute(new ChangePasswordCommand('user-id', CURRENT, NEXT)),
    ).rejects.toThrow(UnauthorizedException);

    expect(userRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ passwordHash: true }) as Record<
          string,
          unknown
        >,
      }),
    );
  });

  it('stores the new hash, clears mustChangePassword, and revokes every session', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-id',
      passwordHash: currentHash,
    });
    userRepo.update.mockResolvedValue(undefined);
    refreshTokenRepo.delete.mockResolvedValue(undefined);

    await expect(
      handler.execute(new ChangePasswordCommand('user-id', CURRENT, NEXT)),
    ).resolves.toBeUndefined();

    expect(userRepo.update).toHaveBeenCalledTimes(1);
    const [updatedUserId, partialUser] = userRepo.update.mock.calls[0] as [
      string,
      Partial<UserEntity>,
    ];
    expect(updatedUserId).toBe('user-id');
    expect(await bcrypt.compare(NEXT, partialUser.passwordHash!)).toBe(true);
    expect(partialUser.mustChangePassword).toBe(false);

    // The temporary password was shared with whoever created the account, so
    // every other session it authorised has to go.
    expect(refreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 'user-id' });
  });
});
