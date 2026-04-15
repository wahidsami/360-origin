import { BadRequestException, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Resend } from 'resend';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from './notifications.service';

type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    created_at?: string;
    bounce?: {
      type?: string;
      subtype?: string;
      message?: string;
    };
  };
};

@Controller('webhooks')
export class ResendWebhooksController {
  private readonly logger = new Logger(ResendWebhooksController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post('resend')
  async handleResendWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    const event = this.verifyAndParse(req, {
      svixId,
      svixTimestamp,
      svixSignature,
    });

    if (!event?.type || !event?.data) {
      return { received: true, handled: 0 };
    }

    if (event.type !== 'email.bounced' && event.type !== 'email.delivery_delayed') {
      return { received: true, handled: 0 };
    }

    const recipients = this.extractRecipients(event.data.to);
    if (recipients.length === 0) {
      return { received: true, handled: 0 };
    }

    const emailId = event.data.email_id || `${event.type}:${recipients.join(',')}`;
    let handled = 0;

    for (const recipientEmail of recipients) {
      const user = await this.prisma.user.findUnique({
        where: { email: recipientEmail.toLowerCase() },
        select: { id: true, orgId: true, email: true },
      });
      if (!user) {
        continue;
      }

      const body = this.buildUserMessage(event, user.email);
      await this.notifications.createInAppSystemNotification({
        orgId: user.orgId,
        userId: user.id,
        title: '360Arena email delivery issue',
        body,
        entityId: `${emailId}:${recipientEmail.toLowerCase()}`,
        entityType: 'email',
      });
      handled += 1;
    }

    return { received: true, handled };
  }

  private verifyAndParse(
    req: RawBodyRequest<Request>,
    headers: { svixId?: string; svixTimestamp?: string; svixSignature?: string },
  ): ResendWebhookEvent {
    const rawPayload = req.rawBody?.toString('utf8');
    if (!rawPayload) {
      throw new BadRequestException('Missing webhook payload');
    }

    const secret = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      try {
        return JSON.parse(rawPayload) as ResendWebhookEvent;
      } catch {
        throw new BadRequestException('Invalid webhook payload');
      }
    }

    if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
      throw new BadRequestException('Missing webhook verification headers');
    }

    try {
      const resend = new Resend(this.config.get<string>('RESEND_API_KEY') || 're_placeholder') as any;
      return resend.webhooks.verify({
        payload: rawPayload,
        headers: {
          id: headers.svixId,
          timestamp: headers.svixTimestamp,
          signature: headers.svixSignature,
        },
        webhookSecret: secret,
      }) as ResendWebhookEvent;
    } catch (error) {
      this.logger.warn(`Resend webhook verification failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  private extractRecipients(to?: string[] | string): string[] {
    if (Array.isArray(to)) {
      return to.map((value) => String(value).trim()).filter(Boolean);
    }
    if (typeof to === 'string' && to.trim()) {
      return [to.trim()];
    }
    return [];
  }

  private buildUserMessage(event: ResendWebhookEvent, recipientEmail: string): string {
    const bounce = event.data?.bounce;
    const reason = bounce?.message?.trim() || '';

    if (event.type === 'email.delivery_delayed') {
      return reason
        ? `A recent 360Arena email to ${recipientEmail} was delayed by the mail provider: ${reason}`
        : `A recent 360Arena email to ${recipientEmail} was delayed by the mail provider. Please try again later.`;
    }

    return reason
      ? `A recent 360Arena email to ${recipientEmail} bounced: ${reason}`
      : `A recent 360Arena email to ${recipientEmail} bounced. Please verify the inbox address or contact support.`;
  }
}
