import { createHash } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EmailVerificationTokenEntity } from '../../infrastructure/entities/email-verification-token.entity';
import { SchoolEntity } from '../../infrastructure/entities/school.entity';
import { VerifyEmailCommand } from './verify-email.command';

/**
 * Looked up by the token's hash alone, unscoped — same shape as
 * `reset-password.handler.ts`: there is no authenticated session yet to
 * scope from, the token itself is what proves which School this is about.
 */
@Injectable()
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<
  VerifyEmailCommand,
  void
> {
  constructor(
    @InjectRepository(EmailVerificationTokenEntity)
    private readonly verificationRepository: Repository<EmailVerificationTokenEntity>,
    @InjectRepository(SchoolEntity)
    private readonly schoolRepository: Repository<SchoolEntity>,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<void> {
    const tokenHash = createHash('sha256').update(command.token).digest('hex');

    const verification = await this.verificationRepository.findOne({
      where: { tokenHash, usedAt: IsNull() },
    });

    if (!verification || verification.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    await this.schoolRepository.update(verification.schoolId, {
      emailVerifiedAt: new Date(),
    });
    await this.verificationRepository.update(verification.id, {
      usedAt: new Date(),
    });
  }
}
