import { Module } from '@nestjs/common';
import { RecurringTasksService } from './recurring-tasks.service';
import { RecurringTasksController } from './recurring-tasks.controller';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';
import { AutomationModule } from '../automation/automation.module';
import { SlaModule } from '../sla/sla.module';

@Module({
  imports: [CommonModule, NotificationsModule, ActivityModule, AutomationModule, SlaModule],
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService],
  exports: [RecurringTasksService],
})
export class RecurringTasksModule {}
