import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuditLogService } from './audit-logs.service';

// Previously the audit log could only be WRITTEN to (every service calls
// .record()) but never read -- there was no route at all. An audit trail
// nobody can look at doesn't hold anyone accountable; this closes that gap.
@Controller('admin/audit-logs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.UNIVERSITY_ADMIN, Role.SUPER_ADMIN)
export class AuditLogsController {
  constructor(private auditLogService: AuditLogService) {}

  @Get()
  list(@Req() req, @Query('limit') limit?: string) {
    return this.auditLogService.listForUniversity(
      req.user.universityId,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('verify')
  verify(@Req() req) {
    return this.auditLogService.verifyChain(req.user.universityId);
  }

  @Get('inclusion-proof/:auditLogId')
  inclusionProof(@Req() req, @Param('auditLogId') auditLogId: string) {
    return this.auditLogService.getInclusionProof(req.user.universityId, auditLogId);
  }

  @Get('consistency-proof')
  consistencyProof(@Req() req, @Query('oldSize') oldSize: string) {
    return this.auditLogService.getConsistencyProof(req.user.universityId, parseInt(oldSize, 10));
  }
}
