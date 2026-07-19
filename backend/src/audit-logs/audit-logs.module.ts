import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-logs.service';
import { AuditLogsController } from './audit-logs.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogService, PrismaService],
  exports: [AuditLogService],
})
export class AuditLogsModule {}
