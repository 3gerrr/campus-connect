import { Module } from '@nestjs/common';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService, PrismaService],
  exports: [NotificationPreferencesService],
})
export class NotificationPreferencesModule {}
