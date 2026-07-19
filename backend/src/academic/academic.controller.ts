import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AcademicService } from './academic.service';

@Controller('academic')
@UseGuards(AuthGuard('jwt'))
export class AcademicController {
  constructor(private academicService: AcademicService) {}

  @Get('course-offerings')
  listCourseOfferings(@Req() req, @Query('sessionId') sessionId?: string) {
    return this.academicService.listCourseOfferings(req.user.universityId, sessionId);
  }

  @Get('sessions')
  listSessions(@Req() req) {
    return this.academicService.listActiveSessions(req.user.universityId);
  }

  @Get('my-course-offerings')
  @UseGuards(RolesGuard)
  @Roles(Role.LECTURER)
  listMyCourseOfferings(@Req() req) {
    return this.academicService.listMyCourseOfferings(req.user.id);
  }
}
