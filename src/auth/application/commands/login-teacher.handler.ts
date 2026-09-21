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
import { SchoolEntity } from '../../../school/infrastructure/entities/school.entity';
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
    schoolId: string;
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
    @InjectRepository(SchoolEntity)
    private readonly schoolRepository: Repository<SchoolEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: LoginTeacherCommand): Promise<LoginTeacherResult> {
    const { email, password } = command;

    // Email is unique per School (users.entity.ts), not globally — if the
    // same address is ever registered at two Schools, this arbitrarily
    // returns one of them rather than failing closed. Accepted for now: two
    // signups with the same email is not something the product supports
    // deliberately, and disambiguating it is a real design question (which
    // school did they mean?) left for when it's an actual complaint, not a
    // theoretical one. Whichever row matches is the source of truth for
    // schoolId below — never anything the caller could assert.
    // eslint-disable-next-line local/require-scoped-repository -- schoolId isn't known before this lookup resolves it, see comment above and docs/adr/0010
    const user = await this.userRepository.findOne({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        mustChangePassword: true,
        schoolId: true,
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

    // Gates the trial itself (CONTEXT.md's "Trial" entry). In practice this
    // never blocks a teacher — an admin can only create one after their own
    // School is verified — but the check lives here too rather than assuming
    // that invariant holds forever.
    const school = await this.schoolRepository.findOneBy({ id: user.schoolId });
    if (!school?.emailVerifiedAt) {
      throw new UnauthorizedException(
        'This school has not confirmed its email yet — ask your admin to check their inbox.',
      );
    }

    const payload = { sub: user.id, role: user.role, schoolId: user.schoolId };
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

    // eslint-disable-next-line local/require-scoped-repository -- schoolId is set explicitly below, from the already-resolved user; see docs/adr/0010
    await this.refreshTokenRepository.save({
      id: crypto.randomUUID(),
      schoolId: user.schoolId,
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
        schoolId: user.schoolId,
      },
    };
  }
}
