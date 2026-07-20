import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../prisma.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [RealtimeModule, NotificationPreferencesModule, PushModule],
  providers: [RemindersService, PrismaService],
})
export class RemindersModule {}
