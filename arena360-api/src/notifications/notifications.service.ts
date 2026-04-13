import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationType } from '@prisma/client';
import { IntegrationsService } from '../integrations/integrations.service';
import { NotificationsGateway } from './notifications.gateway';
import { EmailService } from '../email/email.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly gateway: NotificationsGateway,
    private readonly emailService: EmailService,
  ) {}

  private resolveDeliveryConfig(type: NotificationType) {
    switch (type) {
      case 'TASK_ASSIGNED':
        return { event: 'task.assigned', preferenceKey: 'emailTasks' as const };
      case 'TASK_STATUS_CHANGE':
        return { event: 'task.status_changed', preferenceKey: 'emailTasks' as const };
      case 'FINDING_ASSIGNED':
        return { event: 'finding.assigned', preferenceKey: 'emailFindings' as const };
      case 'FINDING_STATUS_CHANGE':
        return { event: 'finding.status_changed', preferenceKey: 'emailFindings' as const };
      case 'INVOICE_OVERDUE':
        return { event: 'invoice.overdue', preferenceKey: 'emailInvoices' as const };
      case 'MENTION':
        return { event: 'comment.mention', preferenceKey: null };
      case 'COMMENT_REPLY':
        return { event: 'comment.reply', preferenceKey: null };
      case 'SLA_BREACH':
        return { event: 'sla.breach', preferenceKey: null };
      default:
        return { event: `notification.${String(type).toLowerCase()}`, preferenceKey: null };
    }
  }

  async create(data: {
    orgId: string;
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    linkUrl?: string;
    entityId?: string;
    entityType?: string;
  }): Promise<{ id: string; createdAt: Date } | null> {
    const recipient = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true, name: true, orgId: true },
    });

    if (!recipient) {
      this.logger.warn(`Notification recipient ${data.userId} was not found; skipping delivery`);
      return null;
    }

    const [prefs, org] = await Promise.all([
      this.getPreferences(data.userId),
      this.prisma.org.findUnique({
        where: { id: data.orgId },
        select: { name: true },
      }),
    ]);

    const orgName = org?.name || 'Arena360';
    const delivery = this.resolveDeliveryConfig(data.type);
    const shouldSendEmail = Boolean(
      recipient.email &&
      delivery.preferenceKey &&
      prefs[delivery.preferenceKey] !== false,
    );
    const shouldCreateInApp = prefs.inApp !== false;

    let notification: { id: string; createdAt: Date } | null = null;

    if (shouldCreateInApp) {
      notification = await this.prisma.notification.create({
        data: {
          orgId: data.orgId,
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body,
          linkUrl: data.linkUrl,
          entityId: data.entityId,
          entityType: data.entityType,
        },
      });
      this.gateway.emitToUser(data.userId, {
        id: notification.id,
        title: data.title,
        body: data.body,
        linkUrl: data.linkUrl,
        type: data.type,
        entityId: data.entityId,
        entityType: data.entityType,
        createdAt: notification.createdAt.toISOString(),
      });
    }

    if (shouldSendEmail) {
      this.emailService.sendNotificationEmail(
        recipient.email,
        data.title,
        data.body,
        data.linkUrl,
        orgName,
      ).catch((error) => {
        this.logger.warn(`Notification email failed for ${recipient.email}`, error);
      });
    }

    this.integrations.dispatchWebhooks(
      data.orgId,
      delivery.event,
      {
        notificationType: data.type,
        userId: data.userId,
        userEmail: recipient?.email,
        title: data.title,
        body: data.body,
        linkUrl: data.linkUrl,
        entityId: data.entityId,
        entityType: data.entityType,
      },
    ).catch((error) => {
      this.logger.warn(`Webhook dispatch failed for ${delivery.event}`, error);
    });

    this.integrations.sendSlackNotification(
      data.orgId,
      data.title,
      data.body,
      data.linkUrl,
    ).catch((error) => {
      this.logger.warn(`Slack notification failed for ${data.title}`, error);
    });

    return notification;
  }

  async findAllForUser(userId: string, unreadOnly = false, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly && { readAt: null }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!n) return null;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async getPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: {
          userId,
          emailTasks: true,
          emailFindings: true,
          emailInvoices: true,
          inApp: true,
        },
      });
    }
    return prefs;
  }

  async updatePreferences(userId: string, data: { emailTasks?: boolean; emailFindings?: boolean; emailInvoices?: boolean; inApp?: boolean }) {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.getPreferences(userId);
  }
}
