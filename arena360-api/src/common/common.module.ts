import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';
import { ConfigModule } from '@nestjs/config';
import { PermissionsGuard } from '../auth/permissions.guard';
import { OperationalAlertsService } from './operational-alerts.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, StorageService, PermissionsGuard, OperationalAlertsService],
  exports: [PrismaService, StorageService, PermissionsGuard, OperationalAlertsService],
})
export class CommonModule { }
