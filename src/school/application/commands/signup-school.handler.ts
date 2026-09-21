import { randomBytes, createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SchoolEntity } from '../../infrastructure/entities/school.entity';
import { EmailVerificationTokenEntity } from '../../infrastructure/entities/email-verification-token.entity';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { EmailService } from '../../../auth/infrastructure/services/email.service';
import { SignupSchoolCommand } from './signup-school.command';

const TRIAL_DAYS = 30;
const VERIFICATION_EXPIRY_HOURS = 24;

export interface SignupResult {
  schoolId: string;
  email: string;
}

/**
 * Creates a School and its founding Admin. Per CONTEXT.md's "Trial" entry,
 * a Subscription does not exist yet and never will unless this School pays
 * — there is nothing to create here beyond the School itself and its first
 * user. The trial is usable immediately; email verification (a separate
 * command) is what the login handlers actually gate on.
 *
 * No uniqueness check against `users.email` here: email is unique per
 * (schoolId, email), not globally, and this School has no existing rows to
 * collide with — a fresh School's first user can never conflict with itself.
 */
@Injectable()
@CommandHandler(SignupSchoolCommand)
export class SignupSchoolHandler implements ICommandHandler<
  SignupSchoolCommand,
  SignupResult
> {
  constructor(
    @InjectRepository(SchoolEntity)
    private readonly schoolRepository: Repository<SchoolEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(EmailVerificationTokenEntity)
    private readonly verificationRepository: Repository<EmailVerificationTokenEntity>,
    private readonly emailService: EmailService,
  ) {}

  async execute(command: SignupSchoolCommand): Promise<SignupResult> {
    const schoolId = crypto.randomUUID();
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await this.schoolRepository.save({
      id: schoolId,
      name: command.schoolName,
      trialEndsAt,
      emailVerifiedAt: null,
    });

    const passwordHash = await bcrypt.hash(command.password, 12);
    // eslint-disable-next-line local/require-scoped-repository -- the School is being created in this same handler, nothing to scope from yet; see docs/adr/0010
    await this.userRepository.save({
      id: crypto.randomUUID(),
      schoolId,
      name: command.adminName,
      email: command.adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      // Chosen by the founder at signup, not handed to them — nothing to
      // force a change of.
      mustChangePassword: false,
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // eslint-disable-next-line local/require-scoped-repository -- the School is being created in this same handler, nothing to scope from yet; see docs/adr/0010
    await this.verificationRepository.save({
      id: crypto.randomUUID(),
      schoolId,
      tokenHash,
      expiresAt: new Date(
        Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
      ),
      usedAt: null,
    });

    await this.emailService.sendVerificationEmail(command.adminEmail, token);

    return { schoolId, email: command.adminEmail };
  }
}
