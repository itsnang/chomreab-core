import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../entities/user.entity';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const token = authHeader.slice(7);
    try {
      const secret = this.configService.getOrThrow<string>('jwt.accessSecret');
      const payload = this.jwtService.verify<{
        sub: string;
        role?: UserRole;
        schoolId?: string;
      }>(token, { secret });
      if (!payload.role || !payload.schoolId) {
        throw new UnauthorizedException();
      }
      request.user = {
        userId: payload.sub,
        role: payload.role,
        schoolId: payload.schoolId,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
