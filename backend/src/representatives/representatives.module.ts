import { Module } from '@nestjs/common';
import { RepresentativesService } from './representatives.service';
import { RepresentativesController } from './representatives.controller';
import { PrismaService } from '../prisma.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  controllers: [RepresentativesController],
  providers: [RepresentativesService, PrismaService],
})
export class RepresentativesModule {}
