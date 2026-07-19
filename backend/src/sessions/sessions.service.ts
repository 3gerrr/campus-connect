import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async recordLogin(userId: string, deviceName?: string, ipAddress?: string, userAgent?: string) {
    return this.prisma.session.create({
      data: { userId, deviceName, ipAddress, userAgent },
    });
  }

  async touch(sessionId: string) {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });
  }

  async listActive(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  // "Log out everywhere" -- important for privileged accounts (lecturers,
  // admins) if a device is lost or a credential is suspected compromised.
  async revokeAll(userId: string) {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeOne(sessionId: string, userId: string) {
    return this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
  }
}
