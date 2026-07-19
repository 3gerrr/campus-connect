import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AcademicService {
  constructor(private prisma: PrismaService) {}

  async listCourseOfferings(universityId: string, academicSessionId?: string) {
    return this.prisma.courseOffering.findMany({
      where: {
        course: { department: { faculty: { universityId } } },
        ...(academicSessionId ? { academicSessionId } : {}),
      },
      include: {
        course: { include: { department: { include: { faculty: true } } } },
        academicSession: true,
        lecturer: { select: { name: true } },
      },
    });
  }

  async listActiveSessions(universityId: string) {
    const now = new Date();
    return this.prisma.academicSession.findMany({
      where: { universityId, endDate: { gte: now } },
      orderBy: { startDate: 'asc' },
    });
  }

  // Used by the lecturer dashboard -- only the offerings THEY teach, not
  // every offering at the university.
  async listMyCourseOfferings(lecturerId: string) {
    return this.prisma.courseOffering.findMany({
      where: { lecturerId },
      include: {
        course: { include: { department: { include: { faculty: true } } } },
        academicSession: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
