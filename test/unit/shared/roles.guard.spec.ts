import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../../../src/shared/guards/roles.guard';
import { UserRole } from '../../../src/shared/entities/user.entity';
import { ROLES_KEY } from '../../../src/shared/decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('allows access when no @Roles() decorator is present (public route)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const mockRequest = { user: { userId: 'user-id', role: UserRole.TEACHER } };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('allows ADMIN to access ADMIN-only route', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const mockRequest = { user: { userId: 'admin-id', role: UserRole.ADMIN } };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks TEACHER from accessing ADMIN-only route', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const mockRequest = { user: { userId: 'user-id', role: UserRole.TEACHER } };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });

  it('blocks request with missing role field', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const mockRequest = { user: { userId: 'user-id' } };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });
});
