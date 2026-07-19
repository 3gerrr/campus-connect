import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PermissionAction, ScopeType } from '@prisma/client';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * The single source of truth for "can this user do this action in this scope".
   * Checks three places, in order, and stops at the first match:
   *   1. Explicit PermissionGrant row (flat, scoped, revocable)
   *   2. An active (non-expired) LeadershipRole covering this scope
   *   3. Course-offering-specific Representative approval, for course-scoped actions
   *
   * Deliberately NOT a graph walk ("Faculty President therefore also Dept
   * President therefore also Rep") -- every grant is explicit so it's always
   * possible to answer "why can this user do this" with one query per source.
   */
  async can(
    userId: string,
    action: PermissionAction,
    scopeType: ScopeType,
    scopeId: string,
  ): Promise<boolean> {
    const grant = await this.prisma.permissionGrant.findFirst({
      where: {
        subjectId: userId,
        action,
        scopeType,
        scopeId,
        revokedAt: null,
      },
    });
    if (grant) return true;

    const now = new Date();
    const leadership = await this.prisma.leadershipRole.findFirst({
      where: {
        userId,
        scopeType,
        scopeId,
        termStart: { lte: now },
        termEnd: { gte: now },
      },
    });
    if (leadership) {
      // Leadership roles carry a fixed set of implicit actions per scope.
      // Kept as a small explicit map rather than a generic inheritance graph.
      const implicitActions: PermissionAction[] = [
        PermissionAction.POST_ANNOUNCEMENT,
        PermissionAction.APPROVE_REPRESENTATIVE,
      ];
      if (implicitActions.includes(action)) return true;
    }

    if (scopeType === ScopeType.COURSE_OFFERING && action === PermissionAction.POST_ANNOUNCEMENT) {
      const rep = await this.prisma.representative.findFirst({
        where: { userId, courseOfferingId: scopeId, status: 'APPROVED' },
      });
      if (rep) return true;
    }

    return false;
  }

  async grant(
    subjectId: string,
    action: PermissionAction,
    scopeType: ScopeType,
    scopeId: string,
    grantedById: string,
  ) {
    return this.prisma.permissionGrant.create({
      data: { subjectId, action, scopeType, scopeId, grantedById },
    });
  }

  async revoke(permissionGrantId: string) {
    return this.prisma.permissionGrant.update({
      where: { id: permissionGrantId },
      data: { revokedAt: new Date() },
    });
  }
}
