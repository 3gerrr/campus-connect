import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { EnrollmentService } from './enrollment.service';

@Controller('enrollment')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class EnrollmentController {
  constructor(private enrollmentService: EnrollmentService) {}

  @Get()
  @Roles(Role.STUDENT)
  listMine(@Req() req: AuthenticatedRequest) {
    return this.enrollmentService.listForStudent(req.user.id);
  }

  @Post()
  @Roles(Role.STUDENT)
  enroll(@Req() req: AuthenticatedRequest, @Body() body: { courseOfferingId: string }) {
    return this.enrollmentService.enroll(req.user.id, body.courseOfferingId);
  }

  @Post('drop')
  @Roles(Role.STUDENT)
  drop(@Req() req: AuthenticatedRequest, @Body() body: { courseOfferingId: string }) {
    return this.enrollmentService.drop(req.user.id, body.courseOfferingId);
  }
}
