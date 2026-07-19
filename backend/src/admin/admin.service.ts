import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../audit-logs/audit-logs.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // --- Institution hierarchy -------------------------------------------------
  // Each create is scoped to the acting admin's own university -- a
  // UNIVERSITY_ADMIN can never stand up structure for a different school,
  // even though the route itself doesn't take a universityId from the body.

  async createCampus(adminId: string, adminUniversityId: string, name: string) {
    const campus = await this.prisma.campus.create({
      data: { name, universityId: adminUniversityId },
    });
    await this.auditLog.record(adminId, 'CAMPUS_CREATED', campus.id, { name });
    return campus;
  }

  async createFaculty(adminId: string, adminUniversityId: string, name: string) {
    const faculty = await this.prisma.faculty.create({
      data: { name, universityId: adminUniversityId },
    });
    await this.auditLog.record(adminId, 'FACULTY_CREATED', faculty.id, { name });
    return faculty;
  }

  async createDepartment(adminId: string, adminUniversityId: string, facultyId: string, name: string) {
    await this.assertFacultyBelongsToUniversity(facultyId, adminUniversityId);
    const department = await this.prisma.department.create({ data: { name, facultyId } });
    await this.auditLog.record(adminId, 'DEPARTMENT_CREATED', department.id, { name, facultyId });
    return department;
  }

  async createCourse(
    adminId: string,
    adminUniversityId: string,
    departmentId: string,
    code: string,
    title: string,
  ) {
    await this.assertDepartmentBelongsToUniversity(departmentId, adminUniversityId);
    const course = await this.prisma.course.create({ data: { code, title, departmentId } });
    await this.auditLog.record(adminId, 'COURSE_CREATED', course.id, { code, title });
    return course;
  }

  async createAcademicSession(
    adminId: string,
    adminUniversityId: string,
    name: string,
    startDate: Date,
    endDate: Date,
  ) {
    const session = await this.prisma.academicSession.create({
      data: { name, universityId: adminUniversityId, startDate, endDate },
    });
    await this.auditLog.record(adminId, 'ACADEMIC_SESSION_CREATED', session.id, { name });
    return session;
  }

  async createCourseOffering(
    adminId: string,
    adminUniversityId: string,
    courseId: string,
    academicSessionId: string,
    lecturerId: string,
    campusId?: string,
  ) {
    await this.assertCourseBelongsToUniversity(courseId, adminUniversityId);

    const lecturer = await this.prisma.user.findUnique({ where: { id: lecturerId } });
    if (!lecturer || lecturer.universityId !== adminUniversityId) {
      throw new ForbiddenException('Lecturer does not belong to your university');
    }
    if (lecturer.role !== 'LECTURER') {
      throw new ForbiddenException('Assigned user is not a lecturer');
    }
    if (!lecturer.verified) {
      throw new ForbiddenException(
        'Lecturer must be verified before being assigned a course offering',
      );
    }

    const offering = await this.prisma.courseOffering.create({
      data: { courseId, academicSessionId, lecturerId, campusId },
    });
    await this.auditLog.record(adminId, 'COURSE_OFFERING_CREATED', offering.id, {
      courseId,
      academicSessionId,
      lecturerId,
    });
    return offering;
  }

  // --- Lecturer verification --------------------------------------------------

  async verifyLecturer(adminId: string, adminUniversityId: string, lecturerId: string) {
    const lecturer = await this.prisma.user.findUnique({ where: { id: lecturerId } });
    if (!lecturer) throw new NotFoundException('Lecturer not found');
    if (lecturer.universityId !== adminUniversityId) {
      throw new ForbiddenException('Lecturer does not belong to your university');
    }
    if (lecturer.role !== 'LECTURER') {
      throw new ForbiddenException('User is not registered as a lecturer');
    }

    const updated = await this.prisma.user.update({
      where: { id: lecturerId },
      data: { verified: true, verifiedById: adminId, verifiedAt: new Date() },
    });

    await this.auditLog.record(adminId, 'LECTURER_VERIFIED', lecturerId, {});
    return updated;
  }

  async listPendingLecturers(universityId: string) {
    return this.prisma.user.findMany({
      where: { universityId, role: 'LECTURER', verified: false },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  // --- Scope-integrity helpers -------------------------------------------------
  // These stop an admin from one university from attaching structure to
  // another university's faculty/department/course by guessing an id.

  private async assertFacultyBelongsToUniversity(facultyId: string, universityId: string) {
    const faculty = await this.prisma.faculty.findUnique({ where: { id: facultyId } });
    if (!faculty || faculty.universityId !== universityId) {
      throw new ForbiddenException('Faculty does not belong to your university');
    }
  }

  private async assertDepartmentBelongsToUniversity(departmentId: string, universityId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { faculty: true },
    });
    if (!department || department.faculty.universityId !== universityId) {
      throw new ForbiddenException('Department does not belong to your university');
    }
  }

  private async assertCourseBelongsToUniversity(courseId: string, universityId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { department: { include: { faculty: true } } },
    });
    if (!course || course.department.faculty.universityId !== universityId) {
      throw new ForbiddenException('Course does not belong to your university');
    }
  }
}
