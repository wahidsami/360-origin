import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
    imports: [NotificationsModule, ActivityModule],
    controllers: [ContractsController],
    providers: [ContractsService, PrismaService]
})
export class ContractsModule { }
