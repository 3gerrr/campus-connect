import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnnouncementCategory } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import { ExpoPushService } from '../push/expo-push.service';

// How far ahead the query looks for candidate deadlines each tick. Must be
// comfortably larger than the longest reminder lead time anyone could have
// configured, or a student with a long lead time could miss their window
// entirely between ticks.
const LOOKAHEAD_HOURS = 26;

// How often the scheduler runs. Coarser than "real-time" on purpose --
// this is a reminder about something due in tens of minutes to hours, not
// a live chat; a few minutes of slack is unnoticeable and keeps the job
// cheap.
const TICK_MINUTES = 5;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
    private notificationPreferencesService: NotificationPreferencesService,
    private expoPushService: ExpoPushService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchDueReminders() {
    const now = new Date();
    const lookaheadEnd = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

    const candidates = await this.prisma.deadline.findMany({
      where: { dueAt: { gt: now, lte: lookaheadEnd } },
      include: {
        courseOffering: {
          include: {
            course: true,
            enrollments: {
              where: { status: 'ENROLLED' },
              include: { student: { select: { id: true, reminderLeadMinutes: true } } },
            },
          },
        },
      },
    });

    let sentCount = 0;
    // Accumulated across the whole tick and sent as one batch at the end,
    // rather than one Expo API call per student -- LOOKAHEAD_HOURS=26 can
    // surface hundreds of candidates on a busy tick.
    const pushBatch: {
      userId: string;
      deadline: {
        id: string;
        title: string;
        category: AnnouncementCategory;
        dueAt: Date;
        courseCode: string;
        courseOfferingId: string;
      };
    }[] = [];

    for (const deadline of candidates) {
      for (const enrollment of deadline.courseOffering.enrollments) {
        const student = enrollment.student;

        // Has this student's personal lead time just come due, within
        // this tick's window? e.g. lead=60min, tick=5min: fires exactly
        // once, in the 5-minute window starting 60 minutes before dueAt.
        const targetSendAt = new Date(
          deadline.dueAt.getTime() - student.reminderLeadMinutes * 60 * 1000,
        );
        const withinThisTick =
          targetSendAt <= now && targetSendAt > new Date(now.getTime() - TICK_MINUTES * 60 * 1000);

        if (!withinThisTick) continue;

        const alreadySent = await this.prisma.sentReminder.findUnique({
          where: { deadlineId_userId: { deadlineId: deadline.id, userId: student.id } },
        });
        if (alreadySent) continue;

        const enabled = await this.notificationPreferencesService.isEnabled(
          student.id,
          deadline.category,
          deadline.courseOfferingId,
        );
        if (!enabled) continue;

        // Record BEFORE emitting -- if the emit fails or the process
        // restarts mid-loop, we'd rather silently skip a duplicate-risk
        // resend than double-notify someone. A missed reminder is
        // recoverable (the deadline still shows in their upcoming list);
        // a duplicate spam-y reminder erodes trust in the feature.
        await this.prisma.sentReminder.create({
          data: { deadlineId: deadline.id, userId: student.id },
        });

        this.realtimeGateway.emitToUser(student.id, 'deadline:reminder', {
          deadlineId: deadline.id,
          title: deadline.title,
          category: deadline.category,
          dueAt: deadline.dueAt,
          courseCode: deadline.courseOffering.course.code,
        });

        pushBatch.push({
          userId: student.id,
          deadline: {
            id: deadline.id,
            title: deadline.title,
            category: deadline.category,
            dueAt: deadline.dueAt,
            courseCode: deadline.courseOffering.course.code,
            courseOfferingId: deadline.courseOfferingId,
          },
        });

        sentCount++;
      }
    }

    if (pushBatch.length > 0) {
      await this.expoPushService
        .sendReminderBatch(pushBatch)
        .catch((err) => this.logger.error('push batch send failed for this tick', err));
    }

    if (sentCount > 0) {
      this.logger.log(`Dispatched ${sentCount} deadline reminder(s) this tick`);
    }
  }
}
