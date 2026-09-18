import { Request } from 'express';
import { UserRole } from '../entities/user.entity';

export interface AuthenticatedRequest extends Request {
  user: { userId: string; role: UserRole; schoolId: string };
}
