import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class EnrollmentService {
  constructor(private prisma: PrismaService) {}

  async enroll(studentId: string, courseOfferingId: string) {
    // Validate the offering actually exists before creating an enrollment
    // row against it -- otherwise a typo'd id fails with an opaque Prisma
    // foreign-key error instead of a clear 404.
    const offering = await this.prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
    });
    if (!offering) {
      throw new NotFoundException('Course offering not found');
    }

    return this.prisma.enrollment.upsert({
      where: { studentId_courseOfferingId: { studentId, courseOfferingId } },
      update: { status: EnrollmentStatus.ENROLLED },
      create: { studentId, courseOfferingId, status: EnrollmentStatus.ENROLLED },
    });
  }

  async drop(studentId: string, courseOfferingId: string) {
    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_courseOfferingId: { studentId, courseOfferingId } },
    });
    if (!existing) {
      // Dropping something you were never enrolled in isn't really an
      // error the user needs a stack trace for -- treat it as a no-op
      // that clearly reports what happened, rather than a raw Prisma 404.
      throw new NotFoundException('You are not enrolled in this course offering');
    }

    return this.prisma.enrollment.update({
      where: { studentId_courseOfferingId: { studentId, courseOfferingId } },
      data: { status: EnrollmentStatus.DROPPED },
    });
  }

  // Used by the mobile dashboard to show "my courses" and to know which
  // offerings are already enrolled when rendering the browse/enroll list.
  async listForStudent(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId, status: EnrollmentStatus.ENROLLED },
      include: {
        courseOffering: {
          include: {
            course: { include: { department: { include: { faculty: true } } } },
            academicSession: true,
            lecturer: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Used by ExpoPushService to fan out a new announcement's push to
  // everyone currently enrolled, excluding the person who just posted it.
  async listStudentIdsForOffering(
    courseOfferingId: string,
    excludeUserId?: string,
  ): Promise<string[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        courseOfferingId,
        status: EnrollmentStatus.ENROLLED,
        studentId: excludeUserId ? { not: excludeUserId } : undefined,
      },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  /**
   * The core check: is this user allowed to see this course offering's feed?
   * True for an ENROLLED student, the offering's lecturer, an approved
   * representative, or a university admin. Everyone else is denied --
   * this is what makes "students only see their own courses" actually real,
   * not just a UI-level filter.
   */
  async assertCanView(userId: string, userRole: string, courseOfferingId: string) {
    if (userRole === 'SUPER_ADMIN' || userRole === 'UNIVERSITY_ADMIN') return;

    const offering = await this.prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
    });
    if (!offering) {
      throw new NotFoundException('Course offering not found');
    }
    if (offering.lecturerId === userId) return;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseOfferingId: { studentId: userId, courseOfferingId } },
    });
    if (enrollment?.status === EnrollmentStatus.ENROLLED) return;

    const rep = await this.prisma.representative.findFirst({
      where: { userId, courseOfferingId, status: 'APPROVED' },
    });
    if (rep) return;

    throw new ForbiddenException('You are not enrolled in this course');
  }
}
