import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { ResendWebhooksController } from './resend-webhooks.controller';
import { CommonModule } from '../common/common.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    CommonModule,
    IntegrationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'super-secret-dev-key-change-me',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationsController, ResendWebhooksController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
