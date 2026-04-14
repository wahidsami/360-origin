import { BadGatewayException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { EmailService } from '../email/email.service';
import { AutomationTriggerEntity, AutomationTriggerEvent, AutomationActionType } from '@prisma/client';

export interface TriggerPayload {
  orgId: string;
  entityType: AutomationTriggerEntity;
  entityId: string;
  event: AutomationTriggerEvent;
  entity: Record<string, any>;
  previousEntity?: Record<string, any>;
}

type AutomationActionKind =
  | 'CREATE_NOTIFICATION'
  | 'SEND_EMAIL'
  | 'DISPATCH_WEBHOOK'
  | 'UPDATE_STATUS'
  | 'ASSIGN_USER';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
    private readonly emailService: EmailService,
  ) { }

  async evaluateRules(payload: TriggerPayload): Promise<void> {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        orgId: payload.orgId,
        isActive: true,
        triggerEntity: payload.entityType,
        triggerEvent: payload.event,
      },
    });
    for (const rule of rules) {
      try {
        const matches = this.matchesConditions(rule.triggerConditions as Record<string, any> | null, payload);
        if (!matches) continue;
        await this.runAction(rule, payload);
        await this.prisma.automationLog.create({
          data: {
            ruleId: rule.id,
            entityType: payload.entityType,
            entityId: payload.entityId,
            success: true,
          },
        });
      } catch (err: any) {
        await this.prisma.automationLog.create({
          data: {
            ruleId: rule.id,
            entityType: payload.entityType,
            entityId: payload.entityId,
            success: false,
            message: err?.message ?? String(err),
          },
        });
      }
    }
  }

  private matchesConditions(conditions: Record<string, any> | null, payload: TriggerPayload): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    const entity = payload.entity;
    for (const [key, value] of Object.entries(conditions)) {
      const entityVal = entity[key];
      const normalized = typeof entityVal === 'string' ? entityVal.toUpperCase() : entityVal;
      const expected = typeof value === 'string' ? value.toUpperCase() : value;
      if (normalized !== expected) return false;
    }
    return true;
  }

  private interpolate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const parts = key.split('.');
      let val: any = data;
      for (const part of parts) {
        val = val?.[part];
      }
      return val != null ? String(val) : '';
    });
  }

  private getActionKind(rule: any): AutomationActionKind {
    const config = rule.actionConfig as Record<string, any> || {};
    const candidate = String(config.actionKind || rule.actionType || 'CREATE_NOTIFICATION').toUpperCase();
    if (candidate === 'SEND_EMAIL') return 'SEND_EMAIL';
    if (candidate === 'DISPATCH_WEBHOOK') return 'DISPATCH_WEBHOOK';
    if (candidate === 'UPDATE_STATUS') return 'UPDATE_STATUS';
    if (candidate === 'ASSIGN_USER') return 'ASSIGN_USER';
    return 'CREATE_NOTIFICATION';
  }

  private getEntityDefaults(payload: TriggerPayload) {
    let defaultTitle = 'Update';
    let defaultLink = '/app/dashboard';
    let notificationType: any = 'TASK_ASSIGNED';

    if (payload.entityType === AutomationTriggerEntity.TASK) {
      defaultTitle = payload.entity.title || 'Task Update';
      defaultLink = `/app/projects/${payload.entity.projectId}?tab=tasks`;
      notificationType = payload.event === AutomationTriggerEvent.STATUS_CHANGED ? 'TASK_STATUS_CHANGE' : 'TASK_ASSIGNED';
    } else if (payload.entityType === AutomationTriggerEntity.FINDING) {
      defaultTitle = payload.entity.title || 'Finding Update';
      defaultLink = `/app/projects/${payload.entity.projectId}?tab=findings`;
      notificationType = payload.event === AutomationTriggerEvent.STATUS_CHANGED ? 'FINDING_STATUS_CHANGE' : 'FINDING_ASSIGNED';
    } else if (payload.entityType === AutomationTriggerEntity.INVOICE) {
      defaultTitle = payload.entity.invoiceNumber || 'Invoice Update';
      defaultLink = `/app/projects/${payload.entity.projectId}?tab=financials`;
      notificationType = 'INVOICE_OVERDUE';
    }

    return { defaultTitle, defaultLink, notificationType };
  }

  private async getRecipientFromConfig(config: Record<string, any>, payload: TriggerPayload): Promise<{ email: string; userId?: string; orgName: string } | null> {
    const userIdField = config.userIdField ?? config.recipientUserIdField ?? 'assigneeId';
    const userId = payload.entity[userIdField] || (typeof config.recipientUserId === 'string' ? config.recipientUserId : undefined);
    const org = await this.prisma.org.findUnique({
      where: { id: payload.orgId },
      select: { name: true },
    });
    const orgName = org?.name || 'Arena360';

    if (typeof userId === 'string' && userId.trim()) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user?.email) {
        return { email: user.email, userId, orgName };
      }
    }

    if (typeof config.recipientEmail === 'string' && config.recipientEmail.trim()) {
      return { email: config.recipientEmail.trim(), orgName };
    }

    return null;
  }

  private async updateEntityStatus(payload: TriggerPayload, config: Record<string, any>): Promise<void> {
    const targetStatus = config.targetStatus;
    if (!targetStatus) return;

    if (payload.entityType === AutomationTriggerEntity.TASK) {
      await this.prisma.task.update({
        where: { id: payload.entityId },
        data: { status: String(targetStatus).toUpperCase().replace(/-/g, '_') as any },
      });
      return;
    }

    if (payload.entityType === AutomationTriggerEntity.FINDING) {
      await this.prisma.finding.update({
        where: { id: payload.entityId },
        data: { status: String(targetStatus).toUpperCase().replace(/-/g, '_') as any },
      });
      return;
    }

    if (payload.entityType === AutomationTriggerEntity.INVOICE) {
      await this.prisma.invoice.update({
        where: { id: payload.entityId },
        data: { status: String(targetStatus).toUpperCase().replace(/-/g, '_') as any },
      });
    }
  }

  private async assignEntityUser(payload: TriggerPayload, config: Record<string, any>): Promise<void> {
    const userIdField = config.userIdField ?? config.targetUserIdField ?? 'assigneeId';
    const userId = payload.entity[userIdField] || config.targetUserId;
    if (!userId || typeof userId !== 'string') return;

    if (payload.entityType === AutomationTriggerEntity.TASK) {
      await this.prisma.task.update({
        where: { id: payload.entityId },
        data: { assigneeId: userId },
      });
      return;
    }

    if (payload.entityType === AutomationTriggerEntity.FINDING) {
      await this.prisma.finding.update({
        where: { id: payload.entityId },
        data: { assignedToId: userId },
      });
    }
  }

  private async dispatchRuleWebhook(ruleId: string, payload: TriggerPayload, config: Record<string, any>): Promise<void> {
    const webhookUrl = config.webhookUrl || config.url;
    const eventName = config.eventName || `automation.${ruleId}`;
    const body = {
      event: eventName,
      ruleId,
      orgId: payload.orgId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      entity: payload.entity,
      previousEntity: payload.previousEntity ?? null,
      timestamp: new Date().toISOString(),
    };

    if (webhookUrl) {
      const response = await fetch(String(webhookUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.secret ? {
            'X-Arena360-Signature': await this.buildWebhookSignature(String(config.secret), JSON.stringify(body)),
          } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new BadGatewayException(`Webhook returned ${response.status}`);
      }
      return;
    }

    await this.integrations.dispatchWebhooks(payload.orgId, eventName, body);
  }

  private async buildWebhookSignature(secret: string, body: string): Promise<string> {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  private async runAction(rule: any, payload: TriggerPayload): Promise<void> {
    const config = rule.actionConfig as Record<string, any> || {};
    const actionKind = this.getActionKind(rule);
    const { defaultTitle, defaultLink, notificationType } = this.getEntityDefaults(payload);

    if (actionKind === 'UPDATE_STATUS') {
      await this.updateEntityStatus(payload, config);
      return;
    }

    if (actionKind === 'ASSIGN_USER') {
      await this.assignEntityUser(payload, config);
      return;
    }

    const title = this.interpolate(config.titleTemplate || defaultTitle, { ...payload.entity, title: payload.entity.title || 'Item' });
    const body = config.bodyTemplate ? this.interpolate(config.bodyTemplate, payload.entity) : undefined;
    const linkUrl = this.interpolate(config.linkUrlTemplate || defaultLink, payload.entity);

    if (actionKind === 'SEND_EMAIL') {
      const recipient = await this.getRecipientFromConfig(config, payload);
      if (!recipient) return;
      await this.emailService.sendNotificationEmail(recipient.email, title, body, linkUrl, recipient.orgName);
      return;
    }

    if (actionKind === 'DISPATCH_WEBHOOK') {
      await this.dispatchRuleWebhook(rule.id, payload, config);
      return;
    }

    const recipient = await this.getRecipientFromConfig(config, payload);
    if (!recipient?.userId) return;

    await this.notifications.create({
      orgId: payload.orgId,
      userId: recipient.userId,
      type: notificationType,
      title,
      body,
      linkUrl,
      entityId: payload.entityId,
      entityType: payload.entityType.toLowerCase(),
    });
  }

  async listRules(orgId: string) {
    return this.prisma.automationRule.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { logs: true } } },
    });
  }

  async getRule(orgId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, orgId },
      include: { logs: { orderBy: { ranAt: 'desc' }, take: 50 } },
    });
    if (!rule) return null;
    return rule;
  }

  async createRule(orgId: string, data: {
    name: string;
    triggerEntity: AutomationTriggerEntity;
    triggerEvent: AutomationTriggerEvent;
    triggerConditions?: Record<string, any>;
    actionType?: AutomationActionType;
    actionConfig: Record<string, any>;
    isActive?: boolean;
  }) {
    return this.prisma.automationRule.create({
      data: {
        orgId,
        name: data.name,
        triggerEntity: data.triggerEntity,
        triggerEvent: data.triggerEvent,
        triggerConditions: data.triggerConditions ?? undefined,
        actionType: data.actionType ?? AutomationActionType.CREATE_NOTIFICATION,
        actionConfig: data.actionConfig,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateRule(orgId: string, id: string, data: Partial<{
    name: string;
    triggerEntity: AutomationTriggerEntity;
    triggerEvent: AutomationTriggerEvent;
    triggerConditions: Record<string, any>;
    actionType: AutomationActionType;
    actionConfig: Record<string, any>;
    isActive: boolean;
  }>) {
    await this.prisma.automationRule.findFirstOrThrow({ where: { id, orgId } });
    return this.prisma.automationRule.update({
      where: { id },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.triggerEntity != null && { triggerEntity: data.triggerEntity }),
        ...(data.triggerEvent != null && { triggerEvent: data.triggerEvent }),
        ...(data.triggerConditions != null && { triggerConditions: data.triggerConditions }),
        ...(data.actionType != null && { actionType: data.actionType }),
        ...(data.actionConfig != null && { actionConfig: data.actionConfig }),
        ...(data.isActive != null && { isActive: data.isActive }),
      },
    });
  }

  async deleteRule(orgId: string, id: string) {
    await this.prisma.automationRule.findFirstOrThrow({ where: { id, orgId } });
    return this.prisma.automationRule.delete({ where: { id } });
  }
}
