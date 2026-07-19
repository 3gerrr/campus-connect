import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationPreferencesService } from './notification-preferences.service';
import { AnnouncementCategory } from '@prisma/client';

@Controller('notification-preferences')
@UseGuards(AuthGuard('jwt'))
export class NotificationPreferencesController {
  constructor(private prefsService: NotificationPreferencesService) {}

  @Get()
  listMine(@Req() req) {
    return this.prefsService.listMine(req.user.id);
  }

  @Patch()
  setPreference(
    @Req() req,
    @Body() body: { category: AnnouncementCategory; enabled: boolean; courseOfferingId?: string },
  ) {
    return this.prefsService.setPreference(
      req.user.id,
      body.category,
      body.enabled,
      body.courseOfferingId,
    );
  }

  @Patch('reminder-lead-time')
  setReminderLeadMinutes(@Req() req, @Body() body: { minutes: number }) {
    return this.prefsService.setReminderLeadMinutes(req.user.id, body.minutes);
  }
}
