import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { IntegrationType } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { UserWithRoles } from '../common/utils/scope.utils';
import { SlackService } from './slack.service';
import { GithubService } from './github.service';
import { CreateIntegrationDto, UpdateIntegrationDto } from './dto/create-integration.dto';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slack: SlackService,
    private readonly github: GithubService,
  ) {}

  private async ensureOrgAccess(orgId: string, user: UserWithRoles) {
    if (user.orgId !== orgId) throw new ForbiddenException('Access denied');
  }

  async listIntegrations(orgId: string, user: UserWithRoles) {
    await this.ensureOrgAccess(orgId, user);
    const list = await this.prisma.integration.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((i) => ({
      ...i,
      config: this.maskSecrets(i.config as Record<string, unknown>, i.type),
    }));
  }

  private maskSecrets(config: Record<string, unknown>, type: IntegrationType): Record<string, unknown> {
    const out = { ...config };
    if (type === IntegrationType.GITHUB && typeof out.token === 'string') {
      out.token = out.token ? '••••••••' : '';
    }
    return out;
  }

  async createIntegration(orgId: string, user: UserWithRoles, dto: CreateIntegrationDto) {
    await this.ensureOrgAccess(orgId, user);
    return this.prisma.integration.create({
      data: {
        orgId,
        type: dto.type as IntegrationType,
        name: dto.name,
        enabled: dto.enabled ?? true,
        config: (dto.config || {}) as object,
      },
    });
  }

  async updateIntegration(orgId: string, id: string, user: UserWithRoles, dto: UpdateIntegrationDto) {
    await this.ensureOrgAccess(orgId, user);
    const existing = await this.prisma.integration.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Integration not found');
    let configData: object | undefined;
    if (dto.config !== undefined) {
      const incoming = dto.config as Record<string, unknown>;
      const existingConfig = (existing.config as Record<string, unknown>) || {};
      const merged = { ...existingConfig };
      for (const [k, v] of Object.entries(incoming)) {
        if (v === '••••••••' || (k === 'token' && (v === undefined || v === null || v === ''))) continue;
        merged[k] = v;
      }
      configData = merged;
    }
    return this.prisma.integration.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.enabled != null && { enabled: dto.enabled }),
        ...(configData != null && { config: configData }),
      },
    });
  }

  async deleteIntegration(orgId: string, id: string, user: UserWithRoles) {
    await this.ensureOrgAccess(orgId, user);
    const existing = await this.prisma.integration.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Integration not found');
    return this.prisma.integration.delete({ where: { id } });
  }

  async testSlack(orgId: string, id: string, user: UserWithRoles) {
    await this.ensureOrgAccess(orgId, user);
    const integration = await this.prisma.integration.findFirst({
      where: { id, orgId, type: IntegrationType.SLACK, enabled: true },
    });
    if (!integration) throw new NotFoundException('Slack integration not found');
    const config = integration.config as { webhookUrl?: string };
    const webhookUrl = config?.webhookUrl;
    if (!webhookUrl || typeof webhookUrl !== 'string') throw new NotFoundException('Slack webhook URL not configured');
    await this.slack.notify(webhookUrl, 'Arena360 test', 'This is a test message from Arena360.');
    return { ok: true };
  }

  async createGitHubIssue(orgId: string, id: string, user: UserWithRoles, title: string, body?: string) {
    await this.ensureOrgAccess(orgId, user);
    const integration = await this.prisma.integration.findFirst({
      where: { id, orgId, type: IntegrationType.GITHUB, enabled: true },
    });
    if (!integration) throw new NotFoundException('GitHub integration not found');
    const config = integration.config as { token?: string; repo?: string };
    const token = config?.token;
    const repoFull = config?.repo;
    if (!token || !repoFull) throw new NotFoundException('GitHub token and repo are required');
    const parsed = this.github.parseRepoFullName(repoFull);
    if (!parsed) throw new NotFoundException('Invalid repo format; use owner/repo');
    return this.github.createIssue({
      owner: parsed.owner,
      repo: parsed.repo,
      title,
      body,
      token,
    });
  }

  async sendSlackNotification(orgId: string, title: string, body?: string, linkUrl?: string): Promise<void> {
    const integration = await this.prisma.integration.findFirst({
      where: { orgId, type: IntegrationType.SLACK, enabled: true },
    });
    if (!integration) return;
    const config = integration.config as { webhookUrl?: string };
    const webhookUrl = config?.webhookUrl;
    if (!webhookUrl || typeof webhookUrl !== 'string') return;
    try {
      await this.slack.notify(webhookUrl, title, body, linkUrl);
    } catch {
      // log and skip - do not fail the main flow
    }
  }

  async dispatchWebhooks(
    orgId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        orgId,
        enabled: true,
        events: { has: event },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    const body = {
      event,
      orgId,
      timestamp: new Date().toISOString(),
      data: payload,
    };
    const serializedBody = JSON.stringify(body);
    const fetchFn = (globalThis as any).fetch as undefined | ((input: string, init?: any) => Promise<any>);

    if (!fetchFn) {
      this.logger.warn(`Webhook dispatch skipped for ${event}: fetch is not available`);
      return;
    }

    await Promise.allSettled(webhooks.map(async (webhook) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Arena360-Event': event,
        'X-Arena360-Org-Id': orgId,
        'X-Arena360-Webhook-Id': webhook.id,
      };

      if (webhook.secret) {
        headers['X-Arena360-Signature'] = createHmac('sha256', webhook.secret).update(serializedBody).digest('hex');
      }

      try {
        const response = await fetchFn(webhook.url, {
          method: 'POST',
          headers,
          body: serializedBody,
        });
        if (!response?.ok) {
          this.logger.warn(`Webhook ${webhook.id} failed with status ${response?.status ?? 'unknown'}`);
        }
      } catch (error) {
        this.logger.warn(`Webhook ${webhook.id} dispatch failed`, error);
      }
    }));
  }

  async listWebhooks(orgId: string, user: UserWithRoles) {
    await this.ensureOrgAccess(orgId, user);
    return this.prisma.webhook.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWebhook(orgId: string, user: UserWithRoles, dto: CreateWebhookDto) {
    await this.ensureOrgAccess(orgId, user);
    return this.prisma.webhook.create({
      data: {
        orgId,
        name: dto.name,
        url: dto.url,
        secret: dto.secret ?? null,
        events: dto.events ?? [],
        enabled: dto.enabled ?? true,
      },
    });
  }

  async updateWebhook(orgId: string, id: string, user: UserWithRoles, dto: UpdateWebhookDto) {
    await this.ensureOrgAccess(orgId, user);
    const existing = await this.prisma.webhook.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Webhook not found');
    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.url != null && { url: dto.url }),
        ...(dto.secret != null && { secret: dto.secret }),
        ...(dto.events != null && { events: dto.events }),
        ...(dto.enabled != null && { enabled: dto.enabled }),
      },
    });
  }

  async deleteWebhook(orgId: string, id: string, user: UserWithRoles) {
    await this.ensureOrgAccess(orgId, user);
    const existing = await this.prisma.webhook.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Webhook not found');
    return this.prisma.webhook.delete({ where: { id } });
  }
}
