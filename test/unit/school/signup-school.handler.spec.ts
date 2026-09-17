import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { SignupSchoolHandler } from '../../../src/school/application/commands/signup-school.handler';
import { SignupSchoolCommand } from '../../../src/school/application/commands/signup-school.command';
import { SchoolEntity } from '../../../src/school/infrastructure/entities/school.entity';
import { EmailVerificationTokenEntity } from '../../../src/school/infrastructure/entities/email-verification-token.entity';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';
import { EmailService } from '../../../src/auth/infrastructure/services/email.service';

describe('SignupSchoolHandler', () => {
  let handler: SignupSchoolHandler;
  let schoolRepo: { save: jest.Mock };
  let userRepo: { save: jest.Mock };
  let verificationRepo: { save: jest.Mock };
  let emailService: { sendVerificationEmail: jest.Mock };

  beforeEach(async () => {
    schoolRepo = { save: jest.fn().mockResolvedValue(undefined) };
    userRepo = { save: jest.fn().mockResolvedValue(undefined) };
    verificationRepo = { save: jest.fn().mockResolvedValue(undefined) };
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        SignupSchoolHandler,
        { provide: getRepositoryToken(SchoolEntity), useValue: schoolRepo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(EmailVerificationTokenEntity),
          useValue: verificationRepo,
        },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    handler = module.get(SignupSchoolHandler);
  });

  it('creates a School with a 30-day trial and no verified email yet', async () => {
    await handler.execute(
      new SignupSchoolCommand(
        'Rise Tutoring',
        'Sochua Ly',
        'sochua@x.com',
        'a-strong-password',
      ),
    );

    expect(schoolRepo.save).toHaveBeenCalledTimes(1);
    const [saved] = schoolRepo.save.mock.calls[0] as [SchoolEntity];
    expect(saved.name).toBe('Rise Tutoring');
    expect(saved.emailVerifiedAt).toBeNull();

    const daysUntilTrialEnds =
      (saved.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilTrialEnds).toBeGreaterThan(29);
    expect(daysUntilTrialEnds).toBeLessThanOrEqual(30);
  });

  it('creates the founding user as an ADMIN, scoped to the new School, password already chosen', async () => {
    await handler.execute(
      new SignupSchoolCommand(
        'Rise Tutoring',
        'Sochua Ly',
        'sochua@x.com',
        'a-strong-password',
      ),
    );

    const [savedSchool] = schoolRepo.save.mock.calls[0] as [SchoolEntity];
    const [savedUser] = userRepo.save.mock.calls[0] as [UserEntity];

    expect(savedUser.schoolId).toBe(savedSchool.id);
    expect(savedUser.role).toBe(UserRole.ADMIN);
    expect(savedUser.email).toBe('sochua@x.com');
    // Chosen by the founder themselves — nothing to force a change of.
    expect(savedUser.mustChangePassword).toBe(false);
    expect(
      await bcrypt.compare('a-strong-password', savedUser.passwordHash),
    ).toBe(true);
  });

  it('sends a verification email to the founding admin, not anyone else', async () => {
    await handler.execute(
      new SignupSchoolCommand(
        'Rise Tutoring',
        'Sochua Ly',
        'sochua@x.com',
        'a-strong-password',
      ),
    );

    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      'sochua@x.com',
      expect.any(String),
    );
  });

  it('saves a verification token scoped to the new School, expiring in the future', async () => {
    await handler.execute(
      new SignupSchoolCommand(
        'Rise Tutoring',
        'Sochua Ly',
        'sochua@x.com',
        'a-strong-password',
      ),
    );

    const [savedSchool] = schoolRepo.save.mock.calls[0] as [SchoolEntity];
    const [savedToken] = verificationRepo.save.mock.calls[0] as [
      EmailVerificationTokenEntity,
    ];

    expect(savedToken.schoolId).toBe(savedSchool.id);
    expect(savedToken.usedAt).toBeNull();
    expect(savedToken.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
