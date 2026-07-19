import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionGuard } from './permission.guard';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [PermissionsService, PermissionGuard, PrismaService],
  exports: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
