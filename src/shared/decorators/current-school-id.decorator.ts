import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/** The authenticated caller's School — see `ScopedRepository`. Every
 *  controller method that reads or writes a tenant-scoped entity takes this
 *  alongside `@CurrentUser()` and threads it into the Command/Query
 *  constructor, exactly the way `teacherId` and other identity params
 *  already flow today. */
export const CurrentSchoolId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException();
    }
    return request.user.schoolId;
  },
);
