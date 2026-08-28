import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForgotPasswordHandler } from '../../../src/auth/application/commands/forgot-password.handler';
import { ForgotPasswordCommand } from '../../../src/auth/application/commands/forgot-password.command';
import { UserEntity } from '../../../src/shared/entities/user.entity';
import { PasswordResetTokenEntity } from '../../../src/auth/infrastructure/entities/password-reset-token.entity';
import { EmailService } from '../../../src/auth/infrastructure/services/email.service';

describe('ForgotPasswordHandler', () => {
  let handler: ForgotPasswordHandler;
  let userRepo: { findOne: jest.Mock };
  let passwordResetTokenRepo: { save: jest.Mock };
  let emailService: { sendPasswordResetEmail: jest.Mock };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    passwordResetTokenRepo = { save: jest.fn() };
    emailService = { sendPasswordResetEmail: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ForgotPasswordHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(PasswordResetTokenEntity),
          useValue: passwordResetTokenRepo,
        },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    handler = module.get(ForgotPasswordHandler);
  });

  it('returns undefined silently when user does not exist (anti-enumeration)', async () => {
    userRepo.findOne.mockResolvedValue(null);
    const cmd = new ForgotPasswordCommand('nobody@example.com');
    await expect(handler.execute(cmd)).resolves.toBeUndefined();
    expect(passwordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('saves a reset token and sends email when user exists', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'jane@example.com',
    });
    passwordResetTokenRepo.save.mockResolvedValue(undefined);
    emailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    const cmd = new ForgotPasswordCommand('jane@example.com');
    await expect(handler.execute(cmd)).resolves.toBeUndefined();

    // One token saved
    expect(passwordResetTokenRepo.save).toHaveBeenCalledTimes(1);
    const saved = (
      passwordResetTokenRepo.save.mock.calls[0] as [PasswordResetTokenEntity]
    )[0];
    expect(saved.userId).toBe('user-id');
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Email sent once to the right address
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [calledEmail, rawToken] = emailService.sendPasswordResetEmail.mock
      .calls[0] as [string, string];
    expect(calledEmail).toBe('jane@example.com');

    // Verify the stored hash is the SHA-256 of the raw token sent in the email
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');
    expect(saved.tokenHash).toBe(expectedHash);
  });
});
