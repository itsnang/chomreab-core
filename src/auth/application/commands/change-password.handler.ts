import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../../../shared/entities/user.entity';
import { RefreshTokenEntity } from '../../infrastructure/entities/refresh-token.entity';
import { ChangePasswordCommand } from './change-password.command';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<
  ChangePasswordCommand,
  void
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const { userId, currentPassword, newPassword } = command;

    // passwordHash is `select: false` on the entity, so it has to be asked for.
    // eslint-disable-next-line local/require-scoped-repository -- userId is the caller's own JWT sub, a single globally-unique row; see docs/adr/0010
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const currentValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const sameAsBefore = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsBefore) {
      throw new BadRequestException(
        'New password must differ from the current one',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    // eslint-disable-next-line local/require-scoped-repository -- userId is the caller's own row; see docs/adr/0010
    await this.userRepository.update(userId, {
      passwordHash,
      mustChangePassword: false,
    });

    // Every other session was authorised with the old password — including
    // whoever the temporary one was shared with — so drop them all. The caller
    // re-authenticates with the new password.
    // eslint-disable-next-line local/require-scoped-repository -- userId is the caller's own row; see docs/adr/0010
    await this.refreshTokenRepository.delete({ userId });
  }
}
