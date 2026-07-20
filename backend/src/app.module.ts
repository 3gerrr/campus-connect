import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { RepresentativesModule } from './representatives/representatives.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { PermissionsModule } from './permissions/permissions.module';
import { SessionsModule } from './sessions/sessions.module';
import { AcademicModule } from './academic/academic.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { DeadlinesModule } from './deadlines/deadlines.module';
import { RemindersModule } from './reminders/reminders.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    // Global default: 60 requests/minute/IP. Individual routes (like
    // announcement posting) tighten this further with @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    // Enables @Cron() in RemindersService -- the deadline reminder engine.
    ScheduleModule.forRoot(),
    AuthModule,
    RepresentativesModule,
    AnnouncementsModule,
    EnrollmentModule,
    PermissionsModule,
    SessionsModule,
    AcademicModule,
    AdminModule,
    RealtimeModule,
    AuditLogsModule,
    DeadlinesModule,
    RemindersModule,
    NotificationPreferencesModule,
    AnalyticsModule,
    PushModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
