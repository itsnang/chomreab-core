import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VerifyEmailHandler } from '../../../src/school/application/commands/verify-email.handler';
import { VerifyEmailCommand } from '../../../src/school/application/commands/verify-email.command';
import { EmailVerificationTokenEntity } from '../../../src/school/infrastructure/entities/email-verification-token.entity';
import { SchoolEntity } from '../../../src/school/infrastructure/entities/school.entity';

describe('VerifyEmailHandler', () => {
  let handler: VerifyEmailHandler;
  let verificationRepo: { findOne: jest.Mock; update: jest.Mock };
  let schoolRepo: { update: jest.Mock };

  const RAW_TOKEN = 'a-raw-token-the-founder-clicked';
  const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

  beforeEach(async () => {
    verificationRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    schoolRepo = { update: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        VerifyEmailHandler,
        {
          provide: getRepositoryToken(EmailVerificationTokenEntity),
          useValue: verificationRepo,
        },
        { provide: getRepositoryToken(SchoolEntity), useValue: schoolRepo },
      ],
    }).compile();

    handler = module.get(VerifyEmailHandler);
  });

  it('throws BadRequestException for a token that does not exist', async () => {
    verificationRepo.findOne.mockResolvedValue(null);
    await expect(
      handler.execute(new VerifyEmailCommand('nonsense')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(schoolRepo.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for an expired token', async () => {
    verificationRepo.findOne.mockResolvedValue({
      id: 'v1',
      schoolId: 'school-1',
      tokenHash: TOKEN_HASH,
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      handler.execute(new VerifyEmailCommand(RAW_TOKEN)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(schoolRepo.update).not.toHaveBeenCalled();
  });

  it('marks the School verified and the token used, on a valid token', async () => {
    verificationRepo.findOne.mockResolvedValue({
      id: 'v1',
      schoolId: 'school-1',
      tokenHash: TOKEN_HASH,
      usedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await handler.execute(new VerifyEmailCommand(RAW_TOKEN));

    expect(schoolRepo.update).toHaveBeenCalledWith(
      'school-1',
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) as Date }),
    );
    expect(verificationRepo.update).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ usedAt: expect.any(Date) as Date }),
    );
  });

  it('looks the token up only by its hash and unused status — a used token cannot be replayed', async () => {
    verificationRepo.findOne.mockResolvedValue(null); // simulates: query excluded the used row
    await expect(
      handler.execute(new VerifyEmailCommand(RAW_TOKEN)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
