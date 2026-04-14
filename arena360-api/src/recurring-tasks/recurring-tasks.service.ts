import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { CreateRecurringTaskDto } from './dto/create-recurring-task.dto';
import { UpdateRecurringTaskDto } from './dto/update-recurring-task.dto';
import { TaskPriority, AutomationTriggerEntity, AutomationTriggerEvent } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { AutomationService } from '../automation/automation.service';
import { SlaService } from '../sla/sla.service';
import { OperationalAlertsService } from '../common/operational-alerts.service';

@Injectable()
export class RecurringTasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private activity: ActivityService,
    private automation: AutomationService,
    private sla: SlaService,
    private alerts: OperationalAlertsService,
  ) {}

  private readonly internalNoticeRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA', 'FINANCE'];

  private async getProjectRecipientIds(projectId: string, roles?: string[]) {
    const allowedRoles = roles ?? this.internalNoticeRoles;
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, role: { in: allowedRoles as any } },
      select: { userId: true, user: { select: { isActive: true } } },
    });
    return [...new Set(members.filter((member) => member.user?.isActive !== false).map((member) => member.userId))];
  }

  private async notifyProjectRecipients(projectId: string, orgId: string, title: string, body: string, linkUrl: string) {
    const recipientIds = await this.getProjectRecipientIds(projectId);
    for (const userId of recipientIds) {
      await this.notifications.create({
        orgId,
        userId,
        type: 'TASK_ASSIGNED',
        title,
        body,
        linkUrl,
        entityType: 'task',
      }).catch(() => {});
    }
  }

  private async logActivity(orgId: string, projectId: string, action: string, entityId: string, description: string, metadata?: Record<string, unknown>) {
    await this.activity.create({
      orgId,
      projectId,
      userId: 'system',
      action,
      entityType: 'task',
      entityId,
      description,
      metadata,
    }).catch(() => {});
  }

  async findAll(projectId: string, user: UserWithRoles) {
    await this.ensureProjectAccess(projectId, user);
    return this.prisma.recurringTaskTemplate.findMany({
      where: { projectId },
      orderBy: { nextRunAt: 'asc' },
    });
  }

  async findOne(projectId: string, templateId: string, user: UserWithRoles) {
    await this.ensureProjectAccess(projectId, user);
    const template = await this.prisma.recurringTaskTemplate.findFirst({
      where: { id: templateId, projectId },
    });
    if (!template) throw new NotFoundException('Recurring task template not found');
    return template;
  }

  async create(projectId: string, user: UserWithRoles, dto: CreateRecurringTaskDto) {
    const project = await this.ensureProjectAccess(projectId, user);
    const priority = (dto.priority?.toUpperCase().replace(/-/g, '_') || 'MEDIUM') as TaskPriority;
    const nextRunAt = dto.nextRunAt ? new Date(dto.nextRunAt) : new Date();
    const template = await this.prisma.recurringTaskTemplate.create({
      data: {
        projectId,
        orgId: project.orgId,
        title: dto.title,
        description: dto.description ?? null,
        priority,
        recurrenceRule: dto.recurrenceRule as object,
        nextRunAt,
        isActive: true,
      },
    });
    await this.logActivity(project.orgId, projectId, 'recurring-task-template.created', template.id, `Recurring task template "${template.title}" created.`, {
      templateId: template.id,
      nextRunAt: template.nextRunAt.toISOString(),
    });
    return template;
  }

  async update(projectId: string, templateId: string, user: UserWithRoles, dto: UpdateRecurringTaskDto) {
    const project = await this.ensureProjectAccess(projectId, user);
    const template = await this.prisma.recurringTaskTemplate.findFirst({
      where: { id: templateId, projectId },
    });
    if (!template) throw new NotFoundException('Recurring task template not found');

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority.toUpperCase().replace(/-/g, '_') as TaskPriority;
    if (dto.recurrenceRule !== undefined) data.recurrenceRule = dto.recurrenceRule;
    if (dto.nextRunAt !== undefined) data.nextRunAt = new Date(dto.nextRunAt);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.recurringTaskTemplate.update({
      where: { id: templateId },
      data,
    });
    await this.logActivity(project.orgId, projectId, 'recurring-task-template.updated', updated.id, `Recurring task template "${updated.title}" updated.`, {
      templateId: updated.id,
      isActive: updated.isActive,
    });
    return updated;
  }

  async remove(projectId: string, templateId: string, user: UserWithRoles) {
    const project = await this.ensureProjectAccess(projectId, user);
    const template = await this.prisma.recurringTaskTemplate.findFirst({
      where: { id: templateId, projectId },
    });
    if (!template) throw new NotFoundException('Recurring task template not found');
    const removed = await this.prisma.recurringTaskTemplate.delete({ where: { id: templateId } });
    await this.logActivity(project.orgId, projectId, 'recurring-task-template.deleted', removed.id, `Recurring task template "${removed.title}" deleted.`, {
      templateId: removed.id,
    });
    return removed;
  }

  /** Cron: every minute, create tasks from due templates and advance nextRunAt */
  @Cron('* * * * *')
  async processDueTemplates() {
    const now = new Date();
    const due = await this.prisma.recurringTaskTemplate.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
      include: { project: true },
    });
    for (const t of due) {
      try {
        const { createdTask, nextRun } = await this.prisma.$transaction(async (tx) => {
          const runAt = t.nextRunAt;
          const task = await tx.task.create({
            data: {
              projectId: t.projectId,
              title: t.title,
              description: t.description,
              status: 'TODO',
              priority: t.priority,
              sourceRecurringId: t.id,
            },
          });
          const computedNextRun = this.computeNextRun(runAt, t.recurrenceRule as { frequency: string; interval?: number; weekday?: number });
          await tx.recurringTaskTemplate.update({
            where: { id: t.id },
            data: { lastRunAt: runAt, nextRunAt: computedNextRun },
          });
          return {
            createdTask: {
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId,
            },
            nextRun: computedNextRun,
          };
        });

        const projectLink = `/app/projects/${t.projectId}?tab=recurring`;
        await this.logActivity(
          t.project.orgId,
          t.projectId,
          'recurring-task.generated',
          createdTask.id,
          `Recurring task "${createdTask.title}" generated from template "${t.title}".`,
          { templateId: t.id, taskId: createdTask.id, nextRunAt: nextRun.toISOString() },
        );

        await this.sla.startOrUpdateTracker(t.project.orgId, 'TASK', createdTask.id, { clientId: t.project.clientId }).catch(() => {});

        await this.automation.evaluateRules({
          orgId: t.project.orgId,
          entityType: AutomationTriggerEntity.TASK,
          entityId: createdTask.id,
          event: AutomationTriggerEvent.CREATED,
          entity: {
            id: createdTask.id,
            projectId: t.projectId,
            title: createdTask.title,
            status: createdTask.status,
            priority: createdTask.priority,
            assigneeId: createdTask.assigneeId ?? null,
          },
        }).catch(() => {});

        await this.notifyProjectRecipients(
          t.projectId,
          t.project.orgId,
          'Recurring task generated',
          `Task "${createdTask.title}" was created from the recurring template "${t.title}".`,
          projectLink,
        );
      } catch (err) {
        // Log but don't fail other templates
        console.error(`RecurringTasksService: failed to process template ${t.id}`, err);
        await this.alerts.alertOrg(
          t.project.orgId,
          'Recurring task job failed',
          `Recurring task template "${t.title}" failed to process: ${err instanceof Error ? err.message : String(err)}`,
          {
            source: 'recurring-tasks.job',
            entityType: 'recurring-task',
            entityId: t.id,
            metadata: { projectId: t.projectId, templateId: t.id },
          },
        );
      }
    }
  }

  private computeNextRun(from: Date, rule: { frequency: string; interval?: number; weekday?: number }): Date {
    const interval = Math.max(1, rule.interval ?? 1);
    const next = new Date(from);
    const freq = (rule.frequency || 'DAILY').toUpperCase();

    if (freq === 'DAILY') {
      next.setDate(next.getDate() + interval);
      return next;
    }
    if (freq === 'WEEKLY') {
      next.setDate(next.getDate() + 7 * interval);
      if (rule.weekday != null && rule.weekday >= 1 && rule.weekday <= 7) {
        const currentDay = next.getDay();
        const target = rule.weekday === 7 ? 0 : rule.weekday;
        const diff = (target - currentDay + 7) % 7;
        next.setDate(next.getDate() + (diff === 0 ? 7 : diff));
      }
      return next;
    }
    if (freq === 'MONTHLY') {
      next.setMonth(next.getMonth() + interval);
      return next;
    }
    next.setDate(next.getDate() + interval);
    return next;
  }

  private async ensureProjectAccess(projectId: string, user: UserWithRoles) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...ScopeUtils.projectScope(user), deletedAt: null },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
