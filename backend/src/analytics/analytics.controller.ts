import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AnalyticsService } from './analytics.service';

@Controller('admin/analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.UNIVERSITY_ADMIN, Role.SUPER_ADMIN)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // A UNIVERSITY_ADMIN always gets their own institution's numbers,
  // regardless of query params -- scope is derived from the authenticated
  // user, never trusted from client input. A SUPER_ADMIN can opt into
  // platform-wide numbers with ?scope=platform; without it, they see their
  // own university's numbers too, same as anyone else.
  @Get('overview')
  overview(@Req() req: AuthenticatedRequest, @Query('scope') scope?: string) {
    const wantsPlatformWide = req.user.role === Role.SUPER_ADMIN && scope === 'platform';
    return this.analyticsService.getOverview(wantsPlatformWide ? null : req.user.universityId);
  }
}
