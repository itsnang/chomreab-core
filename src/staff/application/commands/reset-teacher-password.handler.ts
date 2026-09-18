import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { RefreshTokenEntity } from '../../../auth/infrastructure/entities/refresh-token.entity';
import { generateTempPassword } from '../generate-temp-password';
import { ResetTeacherPasswordCommand } from './reset-teacher-password.command';

export interface ResetTeacherPassword {
  temporaryPassword: string;
}

/**
 * An admin puts a locked-out teacher back to the state a freshly created
 * account is in: a one-time password the admin reads out, and a forced change
 * on next sign-in. This is the only recovery path — `EmailService` is still a
 * stub, so the token-based reset never reaches anyone.
 */
@Injectable()
@CommandHandler(ResetTeacherPasswordCommand)
export class ResetTeacherPasswordHandler implements ICommandHandler<
  ResetTeacherPasswordCommand,
  ResetTeacherPassword
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
  ) {}

  async execute(
    command: ResetTeacherPasswordCommand,
  ): Promise<ResetTeacherPassword> {
    const users = new ScopedRepository(this.userRepository, command.schoolId);
    const refreshTokens = new ScopedRepository(
      this.refreshTokenRepository,
      command.schoolId,
    );

    const teacher = await users.findOneBy({
      id: command.id,
      role: UserRole.TEACHER,
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const temporaryPassword = generateTempPassword();
    await users.update(
      { id: teacher.id },
      {
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        mustChangePassword: true,
      },
    );

    // Whoever was signed in with the old password — the locked-out teacher, or
    // anyone else holding it — is signed out.
    await refreshTokens.delete({ userId: teacher.id });

    return { temporaryPassword };
  }
}
