import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.UNIVERSITY_ADMIN, Role.SUPER_ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('campuses')
  createCampus(@Req() req: AuthenticatedRequest, @Body() body: { name: string }) {
    return this.adminService.createCampus(req.user.id, req.user.universityId, body.name);
  }

  @Post('faculties')
  createFaculty(@Req() req: AuthenticatedRequest, @Body() body: { name: string }) {
    return this.adminService.createFaculty(req.user.id, req.user.universityId, body.name);
  }

  @Post('departments')
  createDepartment(@Req() req: AuthenticatedRequest, @Body() body: { facultyId: string; name: string }) {
    return this.adminService.createDepartment(
      req.user.id,
      req.user.universityId,
      body.facultyId,
      body.name,
    );
  }

  @Post('courses')
  createCourse(@Req() req: AuthenticatedRequest, @Body() body: { departmentId: string; code: string; title: string }) {
    return this.adminService.createCourse(
      req.user.id,
      req.user.universityId,
      body.departmentId,
      body.code,
      body.title,
    );
  }

  @Post('academic-sessions')
  createAcademicSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; startDate: string; endDate: string },
  ) {
    return this.adminService.createAcademicSession(
      req.user.id,
      req.user.universityId,
      body.name,
      new Date(body.startDate),
      new Date(body.endDate),
    );
  }

  @Post('course-offerings')
  createCourseOffering(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      courseId: string;
      academicSessionId: string;
      lecturerId: string;
      campusId?: string;
    },
  ) {
    return this.adminService.createCourseOffering(
      req.user.id,
      req.user.universityId,
      body.courseId,
      body.academicSessionId,
      body.lecturerId,
      body.campusId,
    );
  }

  @Get('lecturers/pending')
  listPendingLecturers(@Req() req: AuthenticatedRequest) {
    return this.adminService.listPendingLecturers(req.user.universityId);
  }

  @Patch('lecturers/:id/verify')
  verifyLecturer(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.verifyLecturer(req.user.id, req.user.universityId, id);
  }
}
