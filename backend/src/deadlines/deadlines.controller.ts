import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DeadlinesService } from './deadlines.service';
import { AnnouncementCategory } from '@prisma/client';

@Controller('deadlines')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DeadlinesController {
  constructor(private deadlinesService: DeadlinesService) {}

  @Post()
  @Roles(Role.LECTURER, Role.STUDENT, Role.UNIVERSITY_ADMIN)
  create(
    @Req() req,
    @Body()
    body: {
      courseOfferingId: string;
      title: string;
      category: AnnouncementCategory;
      dueAt: string;
      announcementId?: string;
    },
  ) {
    return this.deadlinesService.create(
      req.user.id,
      req.user.role,
      body.courseOfferingId,
      body.title,
      body.category,
      new Date(body.dueAt),
      body.announcementId,
    );
  }

  @Get('offering/:courseOfferingId')
  listForOffering(@Req() req, @Param('courseOfferingId') courseOfferingId: string) {
    return this.deadlinesService.listForOffering(req.user.id, req.user.role, courseOfferingId);
  }

  @Get('mine/upcoming')
  @Roles(Role.STUDENT)
  listMineUpcoming(@Req() req, @Query('withinDays') withinDays?: string) {
    return this.deadlinesService.listUpcomingForStudent(
      req.user.id,
      withinDays ? parseInt(withinDays, 10) : undefined,
    );
  }
}
