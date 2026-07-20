import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Injectable()
export class PushTokensService {
  constructor(private prisma: PrismaService) {}

  // Keyed on the token itself, not (userId, token) -- a device's Expo token
  // is stable across logins, so if the same device later logs in as a
  // different user, this reassigns userId rather than leaving a stale row
  // for the old user still receiving pushes for a device they no longer
  // control.
  async register(userId: string, dto: RegisterPushTokenDto) {
    return this.prisma.pushToken.upsert({
      where: { expoPushToken: dto.expoPushToken },
      update: {
        userId,
        platform: dto.platform,
        deviceName: dto.deviceName,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        expoPushToken: dto.expoPushToken,
        platform: dto.platform,
        deviceName: dto.deviceName,
      },
    });
  }

  async unregister(userId: string, expoPushToken: string) {
    return this.prisma.pushToken.updateMany({
      where: { expoPushToken, userId },
      data: { revokedAt: new Date() },
    });
  }

  // Internal helper for ExpoPushService -- not exposed on the controller.
  async listActiveTokensForUsers(userIds: string[]) {
    return this.prisma.pushToken.findMany({
      where: { userId: { in: userIds }, revokedAt: null },
    });
  }
}
