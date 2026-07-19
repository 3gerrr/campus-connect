import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { Role, VerificationStatus, AnnouncementCategory } from '@prisma/client';

@Injectable()
export class DeadlinesService {
  constructor(
    private prisma: PrismaService,
    private enrollmentService: EnrollmentService,
  ) {}

  // Same posting rights as Announcements: the lecturer who owns the
  // offering, or an approved representative for it. Deliberately reusing
  // that exact rule rather than inventing a parallel one -- "who can tell
  // students about upcoming work" should be one rule, not two that could
  // quietly diverge.
  async create(
    creatorId: string,
    creatorRole: Role,
    courseOfferingId: string,
    title: string,
    category: AnnouncementCategory,
    dueAt: Date,
    announcementId?: string,
  ) {
    if (creatorRole === Role.STUDENT) {
      const rep = await this.prisma.representative.findFirst({
        where: { userId: creatorId, courseOfferingId, status: VerificationStatus.APPROVED },
      });
      if (!rep) {
        throw new ForbiddenException(
          'You are not an approved representative for this course offering',
        );
      }
    } else if (creatorRole === Role.LECTURER) {
      const offering = await this.prisma.courseOffering.findUnique({
        where: { id: courseOfferingId },
      });
      if (offering?.lecturerId !== creatorId) {
        throw new ForbiddenException('You do not lecture this course offering');
      }
    } else if (creatorRole !== Role.UNIVERSITY_ADMIN && creatorRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You are not permitted to create deadlines for this course');
    }

    return this.prisma.deadline.create({
      data: { courseOfferingId, title, category, dueAt, announcementId, createdById: creatorId },
    });
  }

  async listForOffering(userId: string, userRole: string, courseOfferingId: string) {
    await this.enrollmentService.assertCanView(userId, userRole, courseOfferingId);

    return this.prisma.deadline.findMany({
      where: { courseOfferingId },
      orderBy: { dueAt: 'asc' },
    });
  }

  // Cross-course view for a student's own dashboard -- "everything coming
  // up across everything I'm enrolled in," not one course at a time.
  async listUpcomingForStudent(studentId: string, withinDays = 14) {
    const now = new Date();
    const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    return this.prisma.deadline.findMany({
      where: {
        dueAt: { gte: now, lte: until },
        courseOffering: {
          enrollments: { some: { studentId, status: 'ENROLLED' } },
        },
      },
      include: {
        courseOffering: { include: { course: true } },
      },
      orderBy: { dueAt: 'asc' },
    });
  }
}
