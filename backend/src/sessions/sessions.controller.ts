import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(AuthGuard('jwt'))
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Get()
  list(@Req() req) {
    return this.sessionsService.listActive(req.user.id);
  }

  @Delete(':id')
  revokeOne(@Req() req, @Param('id') id: string) {
    return this.sessionsService.revokeOne(id, req.user.id);
  }

  @Post('revoke-all')
  revokeAll(@Req() req) {
    return this.sessionsService.revokeAll(req.user.id);
  }
}
