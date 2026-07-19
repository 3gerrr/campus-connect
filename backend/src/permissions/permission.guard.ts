import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from './require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { Role } from '@prisma/client';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermission() on this route -- nothing to enforce here.
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // Platform/university admins bypass scoped checks by design -- but this
    // is the ONLY bypass, and it's still logged by the caller's audit entry.
    if (user.role === Role.SUPER_ADMIN || user.role === Role.UNIVERSITY_ADMIN) {
      return true;
    }

    const scopeId =
      request.params?.[required.scopeIdParam] ?? request.body?.[required.scopeIdParam];

    if (!scopeId) {
      throw new ForbiddenException(
        `Missing scope id "${required.scopeIdParam}" for permission check`,
      );
    }

    const allowed = await this.permissionsService.can(
      user.id,
      required.action,
      required.scopeType,
      scopeId,
    );

    if (!allowed) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
