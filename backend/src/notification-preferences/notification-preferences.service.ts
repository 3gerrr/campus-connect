import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AnnouncementCategory } from '@prisma/client';

@Injectable()
export class NotificationPreferencesService {
  constructor(private prisma: PrismaService) {}

  async listMine(userId: string) {
    return this.prisma.notificationPreference.findMany({ where: { userId } });
  }

  /**
   * Deliberately NOT a Prisma `upsert` keyed on the compound unique index.
   * Postgres treats NULL as distinct from other NULLs in a unique index,
   * so `@@unique([userId, courseOfferingId, category])` does NOT actually
   * prevent two rows with the same (userId, NULL, category) -- the "applies
   * to all my courses" case, where courseOfferingId is null. An upsert
   * relying on that compound key as a true unique lookup would be building
   * on a guarantee the database doesn't provide for this specific case.
   * findFirst + create/update sidesteps it -- slightly less atomic (a
   * narrow race window on rapid duplicate writes), which is an acceptable
   * tradeoff for a low-contention personal settings write, not a
   * security-relevant path.
   */
  async setPreference(
    userId: string,
    category: AnnouncementCategory,
    enabled: boolean,
    courseOfferingId?: string,
  ) {
    const existing = await this.prisma.notificationPreference.findFirst({
      where: { userId, category, courseOfferingId: courseOfferingId ?? null },
    });

    if (existing) {
      return this.prisma.notificationPreference.update({
        where: { id: existing.id },
        data: { enabled },
      });
    }

    return this.prisma.notificationPreference.create({
      data: { userId, category, enabled, courseOfferingId },
    });
  }

  async setReminderLeadMinutes(userId: string, minutes: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { reminderLeadMinutes: minutes },
      select: { id: true, reminderLeadMinutes: true },
    });
  }

  /**
   * Used by RemindersService: is this user actually supposed to get a
   * reminder for this category/course, or did they turn it off? Defaults
   * to enabled (matching the schema's default) when no explicit row
   * exists -- most users will never touch this screen, and defaulting to
   * "on" is what makes the feature useful without configuration, matching
   * what the survey showed the plurality wants out of the box.
   */
  async isEnabled(
    userId: string,
    category: AnnouncementCategory,
    courseOfferingId: string,
  ): Promise<boolean> {
    // Course-specific preference takes priority over the "all courses" one
    const specific = await this.prisma.notificationPreference.findFirst({
      where: { userId, category, courseOfferingId },
    });
    if (specific) return specific.enabled;

    const general = await this.prisma.notificationPreference.findFirst({
      where: { userId, category, courseOfferingId: null },
    });
    if (general) return general.enabled;

    return true; // default: on
  }
}
