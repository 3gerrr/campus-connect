import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, PrismaService],
  exports: [SessionsService],
})
export class SessionsModule {}
