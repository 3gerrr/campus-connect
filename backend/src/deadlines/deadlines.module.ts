import { Module } from '@nestjs/common';
import { DeadlinesService } from './deadlines.service';
import { DeadlinesController } from './deadlines.controller';
import { PrismaService } from '../prisma.service';
import { EnrollmentModule } from '../enrollment/enrollment.module';

@Module({
  imports: [EnrollmentModule],
  controllers: [DeadlinesController],
  providers: [DeadlinesService, PrismaService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
