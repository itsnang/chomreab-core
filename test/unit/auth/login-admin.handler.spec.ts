import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginAdminHandler } from '../../../src/auth/application/commands/login-admin.handler';
import { LoginAdminCommand } from '../../../src/auth/application/commands/login-admin.command';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';
import { RefreshTokenEntity } from '../../../src/auth/infrastructure/entities/refresh-token.entity';
import { SchoolEntity } from '../../../src/school/infrastructure/entities/school.entity';

describe('LoginAdminHandler', () => {
  let handler: LoginAdminHandler;
  let userRepo: { findOne: jest.Mock };
  let refreshTokenRepo: { save: jest.Mock };
  let schoolRepo: { findOneBy: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let configService: { getOrThrow: jest.Mock };

  const passwordHash = bcrypt.hashSync('password123', 12);

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: 'school-1',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash,
    role: UserRole.ADMIN,
    mustChangePassword: false,
  };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    refreshTokenRepo = { save: jest.fn() };
    // Verified by default — most tests aren't about this gate at all; the
    // one test that is overrides it explicitly.
    schoolRepo = {
      findOneBy: jest.fn().mockResolvedValue({ emailVerifiedAt: new Date() }),
    };
    jwtService = { sign: jest.fn() };
    configService = { getOrThrow: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LoginAdminHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: refreshTokenRepo,
        },
        { provide: getRepositoryToken(SchoolEntity), useValue: schoolRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    handler = module.get(LoginAdminHandler);

    configService.getOrThrow.mockImplementation((key: unknown) => {
      const map: Record<string, string> = {
        'jwt.accessSecret': 'access-secret-32-chars-long-minimum',
        'jwt.accessExpiry': '15m',
        'jwt.refreshSecret': 'refresh-secret-32-chars-long-minimum',
        'jwt.refreshExpiry': '7d',
      };
      return map[key as string];
    });
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    refreshTokenRepo.save.mockResolvedValue(undefined);
  });

  it('throws UnauthorizedException when user not found', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      handler.execute(new LoginAdminCommand('x@example.com', 'pass')),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
  });

  it('throws UnauthorizedException when password is wrong', async () => {
    userRepo.findOne.mockResolvedValue(mockAdminUser);
    await expect(
      handler.execute(new LoginAdminCommand('admin@example.com', 'wrong')),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
  });

  it('throws UnauthorizedException when user role is TEACHER', async () => {
    userRepo.findOne.mockResolvedValue({
      ...mockAdminUser,
      role: UserRole.TEACHER,
    });
    await expect(
      handler.execute(
        new LoginAdminCommand('admin@example.com', 'password123'),
      ),
    ).rejects.toThrow(
      new UnauthorizedException('Access restricted to admin accounts'),
    );
  });

  it("throws UnauthorizedException when the School's email is not verified", async () => {
    userRepo.findOne.mockResolvedValue(mockAdminUser);
    schoolRepo.findOneBy.mockResolvedValue({ emailVerifiedAt: null });
    await expect(
      handler.execute(
        new LoginAdminCommand('admin@example.com', 'password123'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenRepo.save).not.toHaveBeenCalled();
  });

  it('returns tokens and profile when user is ADMIN', async () => {
    userRepo.findOne.mockResolvedValue(mockAdminUser);

    const result = await handler.execute(
      new LoginAdminCommand('admin@example.com', 'password123'),
    );

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(result.user).toEqual({
      id: 'admin-1',
      schoolId: 'school-1',
      name: 'Admin',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      mustChangePassword: false,
    });
    expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
  });
});
