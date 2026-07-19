import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const WEEKS_OF_HISTORY = 8;

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * `universityId: null` means platform-wide (SUPER_ADMIN only, enforced at
   * the controller). A UNIVERSITY_ADMIN only ever sees their own
   * institution's numbers, matching the scoping used everywhere else in
   * the admin API.
   *
   * This exists specifically because "the app has good ideas" and "the
   * app is being used, and usage is growing" are different claims, and
   * only the second one is something an investor can independently check.
   * The weekly buckets below are what make a growth curve possible to
   * draw at all -- they only mean something if collection started early,
   * which is the whole reason this was built now rather than deferred to
   * a "v3 analytics dashboard."
   */
  async getOverview(universityId: string | null) {
    const universityScope = universityId ? { universityId } : {};
    const courseOfferingScope = universityId
      ? { course: { department: { faculty: { universityId } } } }
      : {};

    const [
      totalUniversities,
      totalStudents,
      totalLecturers,
      verifiedLecturers,
      totalCourseOfferings,
      totalAnnouncements,
      totalEnrollments,
      totalReadReceipts,
      totalDeadlines,
      totalRemindersSent,
      totalApprovedReps,
    ] = await Promise.all([
      universityId ? Promise.resolve(1) : this.prisma.university.count(),
      this.prisma.user.count({ where: { ...universityScope, role: 'STUDENT' } }),
      this.prisma.user.count({ where: { ...universityScope, role: 'LECTURER' } }),
      this.prisma.user.count({ where: { ...universityScope, role: 'LECTURER', verified: true } }),
      this.prisma.courseOffering.count({ where: courseOfferingScope }),
      this.prisma.announcement.count({
        where: universityId ? { courseOffering: courseOfferingScope } : {},
      }),
      this.prisma.enrollment.count({
        where: universityId
          ? { status: 'ENROLLED', courseOffering: courseOfferingScope }
          : { status: 'ENROLLED' },
      }),
      this.prisma.announcementReadReceipt.count({
        where: universityId
          ? { announcement: { courseOffering: courseOfferingScope } }
          : {},
      }),
      this.prisma.deadline.count({
        where: universityId ? { courseOffering: courseOfferingScope } : {},
      }),
      this.prisma.sentReminder.count({
        where: universityId
          ? { deadline: { courseOffering: courseOfferingScope } }
          : {},
      }),
      this.prisma.representative.count({
        where: universityId
          ? { status: 'APPROVED', courseOffering: courseOfferingScope }
          : { status: 'APPROVED' },
      }),
    ]);

    const [weeklySignups, weeklyAnnouncements] = await Promise.all([
      this.weeklyBuckets('user', universityScope),
      this.weeklyBuckets(
        'announcement',
        universityId ? { courseOffering: courseOfferingScope } : {},
      ),
    ]);

    return {
      totals: {
        universities: totalUniversities,
        students: totalStudents,
        lecturers: totalLecturers,
        verifiedLecturers,
        courseOfferings: totalCourseOfferings,
        announcements: totalAnnouncements,
        activeEnrollments: totalEnrollments,
        announcementReads: totalReadReceipts,
        deadlinesScheduled: totalDeadlines,
        remindersSent: totalRemindersSent,
        approvedRepresentatives: totalApprovedReps,
      },
      weeklySignups,
      weeklyAnnouncements,
    };
  }

  // Fetches createdAt timestamps for the last N weeks and buckets them in
  // application code rather than a Postgres-specific date_trunc query --
  // slightly less efficient at large scale, but portable and easy to
  // verify by reading it, which matters more at this stage than shaving
  // milliseconds off an admin-only, infrequently-hit endpoint.
  private async weeklyBuckets(
    model: 'user' | 'announcement',
    scope: Record<string, unknown>,
  ) {
    const since = new Date(Date.now() - WEEKS_OF_HISTORY * 7 * 24 * 60 * 60 * 1000);

    const rows =
      model === 'user'
        ? await this.prisma.user.findMany({
            where: { ...scope, createdAt: { gte: since } },
            select: { createdAt: true },
          })
        : await this.prisma.announcement.findMany({
            where: { ...scope, createdAt: { gte: since } },
            select: { createdAt: true },
          });

    const buckets: { weekStart: string; count: number }[] = [];
    for (let i = WEEKS_OF_HISTORY - 1; i >= 0; i--) {
      const weekStart = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const count = rows.filter((r) => r.createdAt >= weekStart && r.createdAt < weekEnd).length;
      buckets.push({ weekStart: weekStart.toISOString().slice(0, 10), count });
    }
    return buckets;
  }
}
