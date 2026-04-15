import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import * as Joi from 'joi';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MilestonesModule } from './milestones/milestones.module';
import { FilesModule } from './files/files.module';
import { FindingsModule } from './findings/findings.module';
import { ReportsModule } from './reports/reports.module';
import { ContractsModule } from './contracts/contracts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { EmailModule } from './email/email.module';
import { SearchModule } from './search/search.module';
import { OrgModule } from './org/org.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { AutomationModule } from './automation/automation.module';
import { SprintsModule } from './sprints/sprints.module';
import { ActivityModule } from './activity/activity.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { SlaModule } from './sla/sla.module';
import { WikiModule } from './wiki/wiki.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportBuilderModule } from './report-builder/report-builder.module';
import { ProjectWorkspaceModule } from './project-workspace/project-workspace.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RecurringTasksModule } from './recurring-tasks/recurring-tasks.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { APP_FILTER } from '@nestjs/core';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { OperationalExceptionFilter } from './common/filters/operational-exception.filter';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('1d'),
        PORT: Joi.number().default(3000),
        ALLOWED_ORIGINS: Joi.string().required(),
        S3_ENDPOINT: Joi.string().optional(),
        S3_ACCESS_KEY: Joi.string().optional(),
        S3_SECRET_KEY: Joi.string().optional(),
        S3_BUCKET: Joi.string().optional(),
        S3_REGION: Joi.string().default('us-east-1'),
        OPENAI_API_KEY: Joi.string().optional(),
        OPENAI_MODEL: Joi.string().default('gpt-4o'),
        RESEND_WEBHOOK_SECRET: Joi.string().optional(),
        FRONTEND_URL: Joi.string().optional(),
        API_URL: Joi.string().optional(),
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    CommonModule,
    AuthModule,
    AuditLogsModule,
    ClientsModule,
    ProjectsModule,
    TasksModule,
    UsersModule,
    DashboardModule,
    MilestonesModule,
    FilesModule,
    FindingsModule,
    ReportsModule,
    ContractsModule,
    InvoicesModule,
    DiscussionsModule,
    EmailModule,
    SearchModule,
    OrgModule,
    AiModule,
    NotificationsModule,
    TimeEntriesModule,
    AutomationModule,
    SprintsModule,
    ActivityModule,
    ApprovalsModule,
    IntegrationsModule,
    CustomFieldsModule,
    SlaModule,
    WikiModule,
    PaymentsModule,
    ReportBuilderModule,
    ProjectWorkspaceModule,
    RecurringTasksModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: OperationalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
