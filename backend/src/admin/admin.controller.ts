import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.UNIVERSITY_ADMIN, Role.SUPER_ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('campuses')
  createCampus(@Req() req, @Body() body: { name: string }) {
    return this.adminService.createCampus(req.user.id, req.user.universityId, body.name);
  }

  @Post('faculties')
  createFaculty(@Req() req, @Body() body: { name: string }) {
    return this.adminService.createFaculty(req.user.id, req.user.universityId, body.name);
  }

  @Post('departments')
  createDepartment(@Req() req, @Body() body: { facultyId: string; name: string }) {
    return this.adminService.createDepartment(
      req.user.id,
      req.user.universityId,
      body.facultyId,
      body.name,
    );
  }

  @Post('courses')
  createCourse(@Req() req, @Body() body: { departmentId: string; code: string; title: string }) {
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
    @Req() req,
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
    @Req() req,
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
  listPendingLecturers(@Req() req) {
    return this.adminService.listPendingLecturers(req.user.universityId);
  }

  @Patch('lecturers/:id/verify')
  verifyLecturer(@Req() req, @Param('id') id: string) {
    return this.adminService.verifyLecturer(req.user.id, req.user.universityId, id);
  }
}
