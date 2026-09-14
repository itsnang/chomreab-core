import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import ms from 'ms';
import * as bcrypt from 'bcrypt';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { RefreshTokenEntity } from '../../infrastructure/entities/refresh-token.entity';
import { LoginTeacherCommand } from './login-teacher.command';

interface LoginTeacherResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    mustChangePassword: boolean;
  };
}

@CommandHandler(LoginTeacherCommand)
export class LoginTeacherHandler implements ICommandHandler<
  LoginTeacherCommand,
  LoginTeacherResult
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: LoginTeacherCommand): Promise<LoginTeacherResult> {
    const { email, password } = command;

    const user = await this.userRepository.findOne({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        mustChangePassword: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role !== UserRole.TEACHER) {
      throw new UnauthorizedException('Access restricted to teacher accounts');
    }

    const payload = { sub: user.id, role: user.role };
    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');
    const accessExpiry =
      this.configService.getOrThrow<string>('jwt.accessExpiry');
    const refreshSecret =
      this.configService.getOrThrow<string>('jwt.refreshSecret');
    const refreshExpiry =
      this.configService.getOrThrow<string>('jwt.refreshExpiry');

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: accessExpiry as ms.StringValue,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiry as ms.StringValue,
    });

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(
      Date.now() + ms(refreshExpiry as ms.StringValue),
    );

    await this.refreshTokenRepository.save({
      id: crypto.randomUUID(),
      tokenHash,
      userId: user.id,
      expiresAt,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
