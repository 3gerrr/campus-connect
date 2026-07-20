import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { PrismaService } from '../prisma.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [EnrollmentModule, RealtimeModule, AuditLogsModule, PushModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, PrismaService],
})
export class AnnouncementsModule {}
