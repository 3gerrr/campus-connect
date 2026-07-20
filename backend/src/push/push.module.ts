import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';
import { PushTokensController } from './push-tokens.controller';
import { PushTokensService } from './push-tokens.service';
import { ExpoPushService } from './expo-push.service';

@Module({
  imports: [EnrollmentModule, NotificationPreferencesModule],
  controllers: [PushTokensController],
  providers: [PushTokensService, ExpoPushService, PrismaService],
  exports: [ExpoPushService],
})
export class PushModule {}
