import { Request } from 'express';
import { Role } from '../../common/enums/role.enum';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: Role;
    universityId: string;
  };
}
