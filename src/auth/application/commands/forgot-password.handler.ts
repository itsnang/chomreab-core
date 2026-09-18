import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UserEntity } from '../../../shared/entities/user.entity';
import { PasswordResetTokenEntity } from '../../infrastructure/entities/password-reset-token.entity';
import { EmailService } from '../../infrastructure/services/email.service';
import { ForgotPasswordCommand } from './forgot-password.command';

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler implements ICommandHandler<
  ForgotPasswordCommand,
  void
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly passwordResetTokenRepository: Repository<PasswordResetTokenEntity>,
    private readonly emailService: EmailService,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    const { email } = command;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.passwordResetTokenRepository.save({
      id: randomUUID(),
      schoolId: user.schoolId,
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await this.emailService.sendPasswordResetEmail(user.email, token);
  }
}
