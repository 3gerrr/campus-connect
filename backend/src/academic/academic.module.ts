import { Module } from '@nestjs/common';
import { AcademicService } from './academic.service';
import { AcademicController } from './academic.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AcademicController],
  providers: [AcademicService, PrismaService],
})
export class AcademicModule {}
