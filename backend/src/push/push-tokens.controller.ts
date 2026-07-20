import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { PushTokensService } from './push-tokens.service';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('push-tokens')
@UseGuards(AuthGuard('jwt'))
export class PushTokensController {
  constructor(private pushTokensService: PushTokensService) {}

  @Post()
  register(@Req() req: AuthenticatedRequest, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokensService.register(req.user.id, dto);
  }

  @Post('unregister')
  unregister(@Req() req: AuthenticatedRequest, @Body() dto: UnregisterPushTokenDto) {
    return this.pushTokensService.unregister(req.user.id, dto.expoPushToken);
  }
}
