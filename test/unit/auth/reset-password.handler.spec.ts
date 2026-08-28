import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { ResetPasswordHandler } from '../../../src/auth/application/commands/reset-password.handler';
import { ResetPasswordCommand } from '../../../src/auth/application/commands/reset-password.command';
import { UserEntity } from '../../../src/shared/entities/user.entity';
import { PasswordResetTokenEntity } from '../../../src/auth/infrastructure/entities/password-reset-token.entity';
import { RefreshTokenEntity } from '../../../src/auth/infrastructure/entities/refresh-token.entity';

describe('ResetPasswordHandler', () => {
  let handler: ResetPasswordHandler;
  let userRepo: { update: jest.Mock };
  let passwordResetTokenRepo: { findOne: jest.Mock; update: jest.Mock };
  let refreshTokenRepo: { delete: jest.Mock };

  beforeEach(async () => {
    userRepo = { update: jest.fn() };
    passwordResetTokenRepo = { findOne: jest.fn(), update: jest.fn() };
    refreshTokenRepo = { delete: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ResetPasswordHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(PasswordResetTokenEntity),
          useValue: passwordResetTokenRepo,
        },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: refreshTokenRepo,
        },
      ],
    }).compile();

    handler = module.get(ResetPasswordHandler);
  });

  it('throws BadRequestException when token is not found', async () => {
    passwordResetTokenRepo.findOne.mockResolvedValue(null);
    const cmd = new ResetPasswordCommand('invalid-token', 'newPassword123');
    await expect(handler.execute(cmd)).rejects.toThrow(
      new BadRequestException('Invalid or expired reset token'),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when token is expired', async () => {
    passwordResetTokenRepo.findOne.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      tokenHash: 'some-hash',
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      usedAt: null,
    });
    const cmd = new ResetPasswordCommand('some-token', 'newPassword123');
    await expect(handler.execute(cmd)).rejects.toThrow(
      new BadRequestException('Invalid or expired reset token'),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('updates password hash, marks token used, deletes all refresh tokens for user', async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    passwordResetTokenRepo.findOne.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      tokenHash: 'some-hash',
      expiresAt: futureDate,
      usedAt: null,
    });
    userRepo.update.mockResolvedValue(undefined);
    passwordResetTokenRepo.update.mockResolvedValue(undefined);
    refreshTokenRepo.delete.mockResolvedValue(undefined);

    const cmd = new ResetPasswordCommand('some-token', 'newPassword123');
    await expect(handler.execute(cmd)).resolves.toBeUndefined();

    // Password updated with bcrypt hash
    expect(userRepo.update).toHaveBeenCalledTimes(1);
    const [updatedUserId, partialUser] = userRepo.update.mock.calls[0] as [
      string,
      Partial<UserEntity>,
    ];
    expect(updatedUserId).toBe('user-id');
    expect(
      await bcrypt.compare('newPassword123', partialUser.passwordHash!),
    ).toBe(true);

    // Token marked used
    expect(passwordResetTokenRepo.update).toHaveBeenCalledTimes(1);
    const [updatedTokenId, partialToken] = passwordResetTokenRepo.update.mock
      .calls[0] as [string, Partial<PasswordResetTokenEntity>];
    expect(updatedTokenId).toBe('token-id');
    expect(partialToken.usedAt).toBeInstanceOf(Date);

    // All refresh tokens for this user deleted (forces re-login on all devices)
    expect(refreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 'user-id' });
  });

  it('uses SHA-256 to hash the token before lookup', async () => {
    const rawToken = 'a3f9'.repeat(16); // 64-char hex string
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');

    passwordResetTokenRepo.findOne.mockResolvedValue(null);
    await expect(
      handler.execute(new ResetPasswordCommand(rawToken, 'newPassword123')),
    ).rejects.toThrow(BadRequestException);

    expect(passwordResetTokenRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: expectedHash }) as Record<
          string,
          unknown
        >,
      }),
    );
  });
});
