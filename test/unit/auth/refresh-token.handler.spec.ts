import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RefreshTokenHandler } from '../../../src/auth/application/commands/refresh-token.handler';
import { RefreshTokenCommand } from '../../../src/auth/application/commands/refresh-token.command';
import { RefreshTokenEntity } from '../../../src/auth/infrastructure/entities/refresh-token.entity';
import { UserRole } from '../../../src/shared/entities/user.entity';

const CONFIG_MAP: Record<string, string> = {
  'jwt.accessSecret': 'access-secret-32-chars-long-minimum',
  'jwt.accessExpiry': '15m',
  'jwt.refreshSecret': 'refresh-secret-32-chars-long-minimum',
  'jwt.refreshExpiry': '7d',
};

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  let refreshTokenRepo: {
    find: jest.Mock;
    delete: jest.Mock;
    save: jest.Mock;
  };
  let jwtService: { verify: jest.Mock; sign: jest.Mock };
  let configService: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    refreshTokenRepo = {
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { verify: jest.fn(), sign: jest.fn() };
    configService = {
      getOrThrow: jest
        .fn()
        .mockImplementation((key: string) => CONFIG_MAP[key]),
    };

    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: refreshTokenRepo,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    handler = module.get(RefreshTokenHandler);
  });

  it('throws UnauthorizedException when JWT signature is invalid', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    await expect(
      handler.execute(new RefreshTokenCommand('bad.token.here')),
    ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
  });

  it('throws UnauthorizedException when no stored token matches', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      role: UserRole.TEACHER,
    });
    refreshTokenRepo.find.mockResolvedValue([]);
    await expect(
      handler.execute(new RefreshTokenCommand('valid.jwt.token')),
    ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
  });

  it('throws UnauthorizedException when stored tokens exist but none match the hash', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      role: UserRole.TEACHER,
    });
    const wrongHash = await bcrypt.hash('different-token', 10);
    refreshTokenRepo.find.mockResolvedValue([
      {
        id: 'tok-1',
        tokenHash: wrongHash,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
      },
    ]);
    await expect(
      handler.execute(new RefreshTokenCommand('valid.jwt.token')),
    ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
  });

  it('returns new token pair, deletes old token, saves new token on success', async () => {
    const rawToken = 'the-refresh-token';
    const tokenHash = await bcrypt.hash(rawToken, 10);
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      role: UserRole.TEACHER,
    });
    refreshTokenRepo.find.mockResolvedValue([
      {
        id: 'tok-old',
        tokenHash,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
      },
    ]);
    jwtService.sign
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');

    const result = await handler.execute(new RefreshTokenCommand(rawToken));

    expect(result.access_token).toBe('new-access-token');
    expect(result.refresh_token).toBe('new-refresh-token');

    expect(refreshTokenRepo.delete).toHaveBeenCalledWith({ id: 'tok-old' });

    const saved = (
      refreshTokenRepo.save.mock.calls[0] as [RefreshTokenEntity]
    )[0];
    expect(await bcrypt.compare('new-refresh-token', saved.tokenHash)).toBe(
      true,
    );
    expect(saved.userId).toBe('user-1');
    expect(saved.expiresAt).toBeInstanceOf(Date);
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      { sub: 'user-1', role: UserRole.TEACHER },
      { secret: CONFIG_MAP['jwt.accessSecret'], expiresIn: '15m' },
    );
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      2,
      { sub: 'user-1', role: UserRole.TEACHER },
      { secret: CONFIG_MAP['jwt.refreshSecret'], expiresIn: '7d' },
    );
  });
});
