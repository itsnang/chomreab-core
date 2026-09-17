import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MoreThan, Repository } from 'typeorm';
import ms from 'ms';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../../shared/entities/user.entity';
import { RefreshTokenEntity } from '../../infrastructure/entities/refresh-token.entity';
import { RefreshTokenCommand } from './refresh-token.command';

interface JwtPayload {
  sub: string;
  role: UserRole;
  schoolId: string;
}

interface RefreshTokenResult {
  access_token: string;
  refresh_token: string;
}

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<
  RefreshTokenCommand,
  RefreshTokenResult
> {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<RefreshTokenResult> {
    const { refreshToken } = command;

    const refreshSecret =
      this.configService.getOrThrow<string>('jwt.refreshSecret');

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const storedTokens = await this.refreshTokenRepository.find({
      where: {
        schoolId: payload.schoolId,
        userId: payload.sub,
        expiresAt: MoreThan(new Date()),
      },
    });

    let matched: RefreshTokenEntity | null = null;
    for (const stored of storedTokens) {
      if (await bcrypt.compare(refreshToken, stored.tokenHash)) {
        matched = stored;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokenRepository.delete({ id: matched.id });

    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');
    const accessExpiry =
      this.configService.getOrThrow<string>('jwt.accessExpiry');
    const refreshExpiry =
      this.configService.getOrThrow<string>('jwt.refreshExpiry');

    const tokenPayload = {
      sub: payload.sub,
      role: payload.role,
      schoolId: payload.schoolId,
    };

    const newAccessToken = this.jwtService.sign(tokenPayload, {
      secret: accessSecret,
      expiresIn: accessExpiry as ms.StringValue,
    });
    const newRefreshToken = this.jwtService.sign(tokenPayload, {
      secret: refreshSecret,
      expiresIn: refreshExpiry as ms.StringValue,
    });

    const tokenHash = await bcrypt.hash(newRefreshToken, 10);
    const expiresAt = new Date(
      Date.now() + ms(refreshExpiry as ms.StringValue),
    );

    await this.refreshTokenRepository.save({
      id: crypto.randomUUID(),
      schoolId: payload.schoolId,
      tokenHash,
      userId: payload.sub,
      expiresAt,
    });

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }
}
