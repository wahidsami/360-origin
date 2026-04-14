import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from './prisma.service';

type OperationalAlertOptions = {
  linkUrl?: string;
  entityId?: string;
  entityType?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class OperationalAlertsService {
  private readonly logger = new Logger(OperationalAlertsService.name);
  private readonly internalRoles = ['SUPER_ADMIN', 'OPS'];

  constructor(private readonly prisma: PrismaService) {}

  async alertOrg(orgId: string | null | undefined, title: string, body: string, options: OperationalAlertOptions = {}) {
    if (!orgId) {
      this.logger.warn(`Skipping operational alert without org context: ${title}`);
      return { recipientCount: 0, deliveredCount: 0 };
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        role: { in: this.internalRoles as any },
      },
      select: { id: true },
    });

    const notificationData = {
      orgId,
      type: 'MENTION' as NotificationType,
      title: `Operational alert: ${title}`,
      body,
      linkUrl: options.linkUrl || '/app/admin/audit-logs',
      entityId: options.entityId || null,
      entityType: options.entityType || 'system-alert',
    };

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.prisma.notification.create({
          data: {
            ...notificationData,
            userId: recipient.id,
          },
        }),
      ),
    );

    const deliveredCount = results.filter((result) => result.status === 'fulfilled').length;

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorId: null,
        action: 'ALERT',
        entity: 'SystemAlert',
        entityId: options.entityId || title,
        afterJson: {
          title,
          body,
          source: options.source || 'unknown',
          linkUrl: notificationData.linkUrl,
          metadata: options.metadata || {},
          recipientCount: recipients.length,
          deliveredCount,
        },
      },
    }).catch((error) => {
      this.logger.warn(`Failed to persist operational alert audit log: ${error?.message || error}`);
    });

    this.logger.warn(`Operational alert queued for org ${orgId}: ${title} (${deliveredCount}/${recipients.length})`);
    return { recipientCount: recipients.length, deliveredCount };
  }
}
