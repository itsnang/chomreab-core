import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../../../shared/entities/user.entity';
import { PasswordResetTokenEntity } from '../../infrastructure/entities/password-reset-token.entity';
import { RefreshTokenEntity } from '../../infrastructure/entities/refresh-token.entity';
import { ResetPasswordCommand } from './reset-password.command';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<
  ResetPasswordCommand,
  void
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly passwordResetTokenRepository: Repository<PasswordResetTokenEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const { token, newPassword } = command;

    const tokenHash = createHash('sha256').update(token).digest('hex');

    // eslint-disable-next-line local/require-scoped-repository -- looked up by the token's hash alone, unscoped, same shape as verify-email.handler.ts; see docs/adr/0010
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { tokenHash, usedAt: IsNull() },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // eslint-disable-next-line local/require-scoped-repository -- resetToken.userId already names one specific, already-verified row; see docs/adr/0010
    await this.userRepository.update(resetToken.userId, { passwordHash });
    // eslint-disable-next-line local/require-scoped-repository -- resetToken.id already names one specific, already-verified row; see docs/adr/0010
    await this.passwordResetTokenRepository.update(resetToken.id, {
      usedAt: new Date(),
    });
    // eslint-disable-next-line local/require-scoped-repository -- resetToken.userId already names one specific, already-verified row; see docs/adr/0010
    await this.refreshTokenRepository.delete({ userId: resetToken.userId });
  }
}
