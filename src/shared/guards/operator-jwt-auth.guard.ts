import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedOperatorRequest extends Request {
  operator: { operatorId: string };
}

/**
 * A second, parallel guard to `JwtAuthGuard` — not a shared one with an
 * Operator "role" layered on top of it. An Operator payload carries no
 * `schoolId` at all, verified against its own secret (`jwt.operatorSecret`,
 * distinct from `jwt.accessSecret`). That is what makes it structurally
 * impossible for an Operator's request to carry a tenant scope into a
 * `ScopedRepository` call — see ADR-0009. Controllers that serve Operators
 * use this guard instead of `JwtAuthGuard`, never both.
 */
@Injectable()
export class OperatorJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedOperatorRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const token = authHeader.slice(7);
    try {
      const secret =
        this.configService.getOrThrow<string>('jwt.operatorSecret');
      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret,
      });
      request.operator = { operatorId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
