import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementCategory } from '@prisma/client';

@Controller('announcements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AnnouncementsController {
  constructor(private announcementsService: AnnouncementsService) {}

  @Post()
  @Roles(Role.LECTURER, Role.STUDENT, Role.UNIVERSITY_ADMIN)
  // Max 10 posts per minute per user -- stops a compromised or malicious
  // account from flooding a course feed. Tune per deployment.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  post(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      courseOfferingId: string;
      category: AnnouncementCategory;
      content: string;
      attachments?: { url: string; fileName: string; fileType: string }[];
      expiresAt?: string;
    },
  ) {
    return this.announcementsService.post(
      req.user.id,
      req.user.role,
      body.courseOfferingId,
      body.category,
      body.content,
      body.attachments,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
  }

  @Post(':id/correction')
  @Roles(Role.LECTURER, Role.STUDENT, Role.UNIVERSITY_ADMIN)
  correct(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: { content: string }) {
    return this.announcementsService.postCorrection(req.user.id, req.user.role, id, body.content);
  }

  @Post(':id/share')
  @Roles(Role.STUDENT, Role.LECTURER)
  share(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.announcementsService.share(req.user.id, id);
  }

  // Any authenticated, enrolled-or-owning user can mark something as read
  // -- no extra role restriction beyond already having legitimate access
  // to see it in the first place (enforced by the underlying feed read).
  @Post(':id/read')
  markAsRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.announcementsService.markAsRead(req.user.id, id);
  }

  @Get('offering/:courseOfferingId')
  list(@Req() req: AuthenticatedRequest, @Param('courseOfferingId') courseOfferingId: string) {
    return this.announcementsService.listForOffering(req.user.id, req.user.role, courseOfferingId);
  }

  // Recomputes and checks the tamper-evident hash chain for this course's
  // announcements. Same access control as reading the feed -- see
  // AnnouncementsService.verifyChain for why the whole chain is rechecked
  // rather than trusting a cached "last known good" state.
  @Get('offering/:courseOfferingId/verify')
  verify(@Req() req: AuthenticatedRequest, @Param('courseOfferingId') courseOfferingId: string) {
    return this.announcementsService.verifyChain(req.user.id, req.user.role, courseOfferingId);
  }

  // Portable O(log n) proof that one announcement is included in the
  // course's history -- see AnnouncementsService.getInclusionProof.
  @Get('offering/:courseOfferingId/inclusion-proof/:announcementId')
  inclusionProof(
    @Req() req: AuthenticatedRequest,
    @Param('courseOfferingId') courseOfferingId: string,
    @Param('announcementId') announcementId: string,
  ) {
    return this.announcementsService.getInclusionProof(
      req.user.id,
      req.user.role,
      courseOfferingId,
      announcementId,
    );
  }

  // Proof that history hasn't been rewritten since an earlier known tree
  // size -- see AnnouncementsService.getConsistencyProof.
  @Get('offering/:courseOfferingId/consistency-proof')
  consistencyProof(
    @Req() req: AuthenticatedRequest,
    @Param('courseOfferingId') courseOfferingId: string,
    @Query('oldSize') oldSize: string,
  ) {
    return this.announcementsService.getConsistencyProof(
      req.user.id,
      req.user.role,
      courseOfferingId,
      parseInt(oldSize, 10),
    );
  }
}
