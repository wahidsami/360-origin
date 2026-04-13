import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';
import { ConfigModule } from '@nestjs/config';
import { PermissionsGuard } from '../auth/permissions.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, StorageService, PermissionsGuard],
  exports: [PrismaService, StorageService, PermissionsGuard],
})
export class CommonModule { }
