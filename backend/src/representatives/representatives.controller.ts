import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RepresentativesService } from './representatives.service';
import { RepresentativeType } from '@prisma/client';

@Controller('representatives')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class RepresentativesController {
  constructor(private repsService: RepresentativesService) {}

  @Post('apply')
  @Roles(Role.STUDENT)
  apply(
    @Req() req,
    @Body()
    body: {
      courseOfferingId: string;
      type?: RepresentativeType;
      applicationNote?: string;
      supportingDocumentUrl?: string;
    },
  ) {
    return this.repsService.apply(
      req.user.id,
      body.courseOfferingId,
      body.type,
      body.applicationNote,
      body.supportingDocumentUrl,
    );
  }

  @Patch(':id/decision')
  @Roles(Role.LECTURER)
  decide(@Req() req, @Param('id') id: string, @Body() body: { approve: boolean }) {
    return this.repsService.decide(id, req.user.id, body.approve);
  }

  @Patch(':id/revoke')
  @Roles(Role.LECTURER)
  revoke(@Req() req, @Param('id') id: string) {
    return this.repsService.revoke(id, req.user.id);
  }

  // Full applicant list, including notes/documents -- lecturer (owner) or
  // admin only. Ownership itself is re-verified inside the service, not
  // just gated by account type here.
  @Get('offering/:courseOfferingId')
  @Roles(Role.LECTURER, Role.UNIVERSITY_ADMIN, Role.SUPER_ADMIN)
  listForOffering(@Req() req, @Param('courseOfferingId') courseOfferingId: string) {
    return this.repsService.listForOffering(courseOfferingId, req.user.id, req.user.role);
  }

  // A student checking their own status only -- returns null if they've
  // never applied, rather than a 404, so the app can render "not applied yet".
  @Get('mine/:courseOfferingId')
  @Roles(Role.STUDENT)
  getMine(@Req() req, @Param('courseOfferingId') courseOfferingId: string) {
    return this.repsService.getMyApplication(req.user.id, courseOfferingId);
  }
}
