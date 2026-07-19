import { SetMetadata } from '@nestjs/common';
import { PermissionAction, ScopeType } from '@prisma/client';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export interface RequiredPermission {
  action: PermissionAction;
  scopeType: ScopeType;
  // Name of the route param or body field holding the scope id,
  // e.g. 'courseOfferingId' -- read dynamically by the guard.
  scopeIdParam: string;
}

export const RequirePermission = (permission: RequiredPermission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
