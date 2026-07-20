import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnnouncementCategory } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import { PushTokensService } from './push-tokens.service';
import { ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from './expo-push.types';

// Expo's hard per-request batch limit for both /push/send and
// /push/getReceipts.
const EXPO_BATCH_SIZE = 100;

// Receipts aren't reliably checkable until some time after the ticket was
// issued -- Expo's own guidance is "at least 15 minutes later, ideally the
// next day". We poll on a 30-minute cron and only look at tickets older
// than this.
const RECEIPT_CHECK_DELAY_MINUTES = 15;

interface SendJob {
  pushTokenId: string;
  expoPushToken: string;
  message: ExpoPushMessage;
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(
    private prisma: PrismaService,
    private pushTokensService: PushTokensService,
    private enrollmentService: EnrollmentService,
    private notificationPreferencesService: NotificationPreferencesService,
  ) {}

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  // Sends every job, chunked to Expo's batch limit. One chunk's network
  // failure doesn't affect the others (Promise.allSettled, not all/any).
  // Tickets come back in the same order as the request, so they're mapped
  // back to jobs by index within each chunk.
  private async sendJobs(jobs: SendJob[]) {
    if (jobs.length === 0) return;

    const chunks = this.chunk(jobs, EXPO_BATCH_SIZE);

    await Promise.allSettled(
      chunks.map(async (batch) => {
        let tickets: ExpoPushTicket[];
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ messages: batch.map((job) => job.message) }),
          });
          const body = await response.json();
          tickets = body.data;
        } catch (err) {
          this.logger.error('Expo push send request failed', err);
          return;
        }

        const now = new Date();
        for (let i = 0; i < batch.length; i++) {
          const job = batch[i];
          const ticket = tickets?.[i];
          if (!ticket) continue;

          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            await this.prisma.pushToken.updateMany({
              where: { id: job.pushTokenId },
              data: { revokedAt: now },
            });
            continue;
          }

          await this.prisma.pushToken.update({
            where: { id: job.pushTokenId },
            data: {
              lastTicketId: ticket.id ?? null,
              lastTicketSentAt: now,
              lastTicketCheckedAt: null,
            },
          });
        }
      }),
    );
  }

  async notifyAnnouncementPosted(
    announcement: { id: string; category: AnnouncementCategory; courseOfferingId: string },
    senderId: string,
  ) {
    const studentIds = await this.enrollmentService.listStudentIdsForOffering(
      announcement.courseOfferingId,
      senderId,
    );
    if (studentIds.length === 0) return;

    const enabledStudentIds: string[] = [];
    for (const studentId of studentIds) {
      const enabled = await this.notificationPreferencesService.isEnabled(
        studentId,
        announcement.category,
        announcement.courseOfferingId,
      );
      if (enabled) enabledStudentIds.push(studentId);
    }
    if (enabledStudentIds.length === 0) return;

    const tokens = await this.pushTokensService.listActiveTokensForUsers(enabledStudentIds);
    const jobs: SendJob[] = tokens.map((token) => ({
      pushTokenId: token.id,
      expoPushToken: token.expoPushToken,
      message: {
        to: token.expoPushToken,
        title: 'New announcement',
        body: announcement.category,
        data: {
          type: 'announcement',
          announcementId: announcement.id,
          courseOfferingId: announcement.courseOfferingId,
        },
        sound: 'default',
      },
    }));

    await this.sendJobs(jobs);
  }

  // Called once per cron tick from RemindersService, with everything it
  // decided to send this tick already accumulated -- not once per student,
  // to avoid up to hundreds of individual Expo calls per 5-minute tick.
  async sendReminderBatch(
    items: {
      userId: string;
      deadline: {
        id: string;
        title: string;
        category: AnnouncementCategory;
        dueAt: Date;
        courseCode: string;
        courseOfferingId: string;
      };
    }[],
  ) {
    if (items.length === 0) return;

    const userIds = [...new Set(items.map((item) => item.userId))];
    const tokens = await this.pushTokensService.listActiveTokensForUsers(userIds);
    const tokensByUserId = new Map<string, typeof tokens>();
    for (const token of tokens) {
      const existing = tokensByUserId.get(token.userId) ?? [];
      existing.push(token);
      tokensByUserId.set(token.userId, existing);
    }

    const jobs: SendJob[] = [];
    for (const item of items) {
      const userTokens = tokensByUserId.get(item.userId) ?? [];
      for (const token of userTokens) {
        jobs.push({
          pushTokenId: token.id,
          expoPushToken: token.expoPushToken,
          message: {
            to: token.expoPushToken,
            title: `Reminder: ${item.deadline.title}`,
            body: `${item.deadline.courseCode} -- due ${item.deadline.dueAt.toLocaleString()}`,
            data: {
              type: 'deadline',
              deadlineId: item.deadline.id,
              courseOfferingId: item.deadline.courseOfferingId,
            },
            sound: 'default',
          },
        });
      }
    }

    await this.sendJobs(jobs);
  }

  // Dead-token cleanup. Only remembers the most recent outstanding ticket
  // per token (overwritten on every send), not a full history of every
  // push attempt -- lighter-weight than this codebase's usual audit-trail
  // instinct (SentReminder, AuditLog), a deliberate choice since this is
  // delivery infra, not a product metric.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkReceipts() {
    const cutoff = new Date(Date.now() - RECEIPT_CHECK_DELAY_MINUTES * 60 * 1000);

    const pending = await this.prisma.pushToken.findMany({
      where: {
        lastTicketId: { not: null },
        lastTicketCheckedAt: null,
        lastTicketSentAt: { lt: cutoff },
      },
      select: { id: true, lastTicketId: true },
    });
    if (pending.length === 0) return;

    const chunks = this.chunk(pending, EXPO_BATCH_SIZE);
    let revokedCount = 0;

    await Promise.allSettled(
      chunks.map(async (batch) => {
        let receipts: Record<string, ExpoPushReceipt>;
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ids: batch.map((t) => t.lastTicketId) }),
          });
          const body = await response.json();
          receipts = body.data;
        } catch (err) {
          this.logger.error('Expo receipt check request failed', err);
          return;
        }

        const now = new Date();
        for (const token of batch) {
          const receipt = token.lastTicketId ? receipts?.[token.lastTicketId] : undefined;

          // Accepts a small chance of missing a slow-to-resolve
          // DeviceNotRegistered signal (Expo can occasionally take longer
          // than our poll window) in exchange for never polling the same
          // ticket forever -- same loss-tolerant posture RemindersService
          // already has for the socket path.
          if (receipt?.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
            await this.prisma.pushToken.update({
              where: { id: token.id },
              data: { revokedAt: now, lastTicketCheckedAt: now },
            });
            revokedCount++;
          } else {
            await this.prisma.pushToken.update({
              where: { id: token.id },
              data: { lastTicketCheckedAt: now },
            });
          }
        }
      }),
    );

    if (revokedCount > 0) {
      this.logger.log(`Revoked ${revokedCount} dead push token(s) after receipt check`);
    }
  }
}
