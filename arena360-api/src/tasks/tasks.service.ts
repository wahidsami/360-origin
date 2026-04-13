import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../automation/automation.service';
import { AutomationTriggerEntity, AutomationTriggerEvent } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { SlaService } from '../sla/sla.service';

@Injectable()
export class TasksService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private automation: AutomationService,
        private activity: ActivityService,
        private sla: SlaService,
    ) { }

    // List tasks for a project (Scoped by Project access)
    async findAll(projectId: string, user: UserWithRoles) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user), deletedAt: null }
        });
        if (!project) throw new NotFoundException('Project not found');

        return this.prisma.task.findMany({
            where: { 
                projectId, 
                deletedAt: null 
            },
            include: {
                assignee: {
                    select: { id: true, name: true, email: true, avatar: true }
                },
                milestone: true,
                sprint: true,
                _count: {
                    select: { timeEntries: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    // Create Task
    async create(projectId: string, user: UserWithRoles, dto: any) {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user), deletedAt: null }
        });
        if (!project) throw new NotFoundException('Project not found');

        const data: any = { ...dto };
        if (data.status) data.status = data.status.toUpperCase().replace(/-/g, '_');
        if (data.priority) data.priority = data.priority.toUpperCase().replace(/-/g, '_');

        // Clean up empty IDs to prevent FK constraint failures
        if (data.assigneeId === '' || !data.assigneeId) data.assigneeId = null;
        if (data.milestoneId === '' || !data.milestoneId) data.milestoneId = null;
        if (data.sprintId === '' || !data.sprintId) data.sprintId = null;

        // Ensure dueDate is a valid Date or null
        let dueDate: Date | null = null;
        if (data.dueDate && data.dueDate !== '') {
            const d = new Date(data.dueDate);
            if (!isNaN(d.getTime())) {
                dueDate = d;
            }
        }
        let startDate: Date | null = null;
        if (data.startDate && data.startDate !== '') {
            const s = new Date(data.startDate);
            if (!isNaN(s.getTime())) {
                startDate = s;
            }
        }

        const task = await this.prisma.task.create({
            data: {
                title: data.title,
                description: data.description,
                status: data.status,
                priority: data.priority,
                dueDate,
                startDate,
                assigneeId: data.assigneeId,
                milestoneId: data.milestoneId,
                sprintId: data.sprintId,
                storyPoints: data.storyPoints != null ? Number(data.storyPoints) : undefined,
                labels: Array.isArray(data.labels) ? data.labels : [],
                projectId,
            },
        });
        if (project.orgId) {
            const isActive = task.status !== 'DONE';
            if (isActive) {
                this.sla.startOrUpdateTracker(project.orgId, 'TASK', task.id, { clientId: project.clientId }).catch(() => { });
            } else {
                this.sla.markMet(project.orgId, 'TASK', task.id).catch(() => { });
            }
        }
        if (task.assigneeId && project.orgId) {
            this.notifications.create({
                orgId: project.orgId,
                userId: task.assigneeId,
                type: 'TASK_ASSIGNED',
                title: 'Task assigned to you',
                body: data.title,
                linkUrl: `/app/projects/${projectId}?tab=tasks`,
                entityId: task.id,
                entityType: 'task',
            }).catch(() => { });
        }
        const entity = { id: task.id, projectId, title: task.title, status: task.status, assigneeId: task.assigneeId };
        this.automation.evaluateRules({
            orgId: project.orgId,
            entityType: AutomationTriggerEntity.TASK,
            entityId: task.id,
            event: AutomationTriggerEvent.CREATED,
            entity,
        }).catch(() => { });
        if (task.assigneeId) {
            this.automation.evaluateRules({
                orgId: project.orgId,
                entityType: AutomationTriggerEntity.TASK,
                entityId: task.id,
                event: AutomationTriggerEvent.ASSIGNED,
                entity,
            }).catch(() => { });
        }
        this.logTaskActivity(projectId, project.orgId, user.id, 'task.created', task, `Task "${task.title}" created`).catch(() => { });
        return task;
    }

    private async logTaskActivity(projectId: string, orgId: string, userId: string, action: string, task: { id: string; title: string }, description: string) {
        this.activity.create({
            orgId,
            projectId,
            userId,
            action,
            entityType: 'task',
            entityId: task.id,
            description,
            metadata: { title: task.title },
        }).catch(() => { });
    }

    // Update Task
    async update(projectId: string, taskId: string, user: UserWithRoles, dto: any) {
        const task = await this.prisma.task.findFirst({
            where: {
                id: taskId,
                projectId,
                project: ScopeUtils.projectScope(user),
                deletedAt: null
            }
        });
        if (!task) throw new NotFoundException('Task not found');

        const data: any = { ...dto };
        if (data.status) data.status = data.status.toUpperCase().replace(/-/g, '_');
        if (data.priority) data.priority = data.priority.toUpperCase().replace(/-/g, '_');

        // Clean up empty IDs to prevent FK constraint failures
        if (data.assigneeId === '' || !data.assigneeId) data.assigneeId = null;
        if (data.milestoneId === '' || !data.milestoneId) data.milestoneId = null;
        if (data.sprintId === '' || !data.sprintId) data.sprintId = null;

        // Construct update data
        const updateData: any = {
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            assigneeId: data.assigneeId,
            milestoneId: data.milestoneId,
            sprintId: data.sprintId,
            labels: Array.isArray(data.labels) ? data.labels : undefined,
            updatedAt: new Date()
        };
        if (data.storyPoints !== undefined) updateData.storyPoints = data.storyPoints == null ? null : Number(data.storyPoints);

        // Handle dueDate strictly
        if (data.dueDate === '') {
            updateData.dueDate = null;
        } else if (data.dueDate) {
            const d = new Date(data.dueDate);
            if (!isNaN(d.getTime())) {
                updateData.dueDate = d;
            }
        }
        if (data.startDate === '') {
            updateData.startDate = null;
        } else if (data.startDate) {
            const s = new Date(data.startDate);
            if (!isNaN(s.getTime())) {
                updateData.startDate = s;
            }
        }

        const updated = await this.prisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: {
                assignee: { select: { id: true, name: true } }
            }
        });
        const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true, name: true, clientId: true } });
        if (project?.orgId && updateData.assigneeId && updateData.assigneeId !== task.assigneeId) {
            this.notifications.create({
                orgId: project.orgId,
                userId: updateData.assigneeId,
                type: 'TASK_ASSIGNED',
                title: 'Task assigned to you',
                body: task.title,
                linkUrl: `/app/projects/${projectId}?tab=tasks`,
                entityId: taskId,
                entityType: 'task',
            }).catch(() => { });
        }
        const entity = {
            ...updated,
            projectId,
            project: { id: projectId, name: project?.name },
            assignee: updated.assignee ? { id: updated.assignee.id, name: updated.assignee.name } : null
        };
        if (project?.orgId) {
            if (updateData.assigneeId != null && updateData.assigneeId !== task.assigneeId) {
                this.automation.evaluateRules({
                    orgId: project.orgId,
                    entityType: AutomationTriggerEntity.TASK,
                    entityId: taskId,
                    event: AutomationTriggerEvent.ASSIGNED,
                    entity,
                    previousEntity: { assigneeId: task.assigneeId, status: task.status },
                }).catch(() => { });
            }
            if (updateData.status != null && updateData.status !== task.status) {
                this.automation.evaluateRules({
                    orgId: project.orgId,
                    entityType: AutomationTriggerEntity.TASK,
                    entityId: taskId,
                    event: AutomationTriggerEvent.STATUS_CHANGED,
                    entity,
                    previousEntity: { assigneeId: task.assigneeId, status: task.status },
                }).catch(() => { });
            }

            if (updateData.status != null && updateData.status !== task.status) {
                if (updateData.status === 'DONE') {
                    this.sla.markMet(project.orgId, 'TASK', taskId).catch(() => { });
                } else {
                    this.sla.startOrUpdateTracker(project.orgId, 'TASK', taskId, { clientId: project.clientId }).catch(() => { });
                }
            }

            // Always trigger UPDATED event
            this.automation.evaluateRules({
                orgId: project.orgId,
                entityType: AutomationTriggerEntity.TASK,
                entityId: taskId,
                event: AutomationTriggerEvent.UPDATED,
                entity,
                previousEntity: { assigneeId: task.assigneeId, status: task.status },
            }).catch(() => { });
        }
        if (project?.orgId) {
            this.logTaskActivity(projectId, project.orgId, user.id, 'task.updated', updated, `Task "${updated.title}" updated`).catch(() => { });
        }
        return updated;
    }

    // Delete Task (Soft Delete)
    async delete(projectId: string, taskId: string, user: UserWithRoles) {
        const task = await this.prisma.task.findFirst({
            where: {
                id: taskId,
                projectId,
                project: ScopeUtils.projectScope(user),
                deletedAt: null
            }
        });
        if (!task) throw new NotFoundException('Task not found');

        const project = await this.prisma.project.findUnique({
            where: { id: task.projectId },
            select: { orgId: true },
        });
        if (project?.orgId) {
            this.sla.markMet(project.orgId, 'TASK', taskId).catch(() => { });
        }

        return this.prisma.task.update({
            where: { id: taskId },
            data: { deletedAt: new Date() }
        });
    }

    // My Work: Aggregated tasks assigned to me, across allowed projects
    async getMyTasks(user: UserWithRoles) {
        return this.prisma.task.findMany({
            where: {
                assigneeId: user.id,
                deletedAt: null,
                project: {
                    ...ScopeUtils.projectScope(user),
                    deletedAt: null,
                },
            },
            include: { project: true },
        });
    }

    // Task dependencies (for Gantt/timeline)
    async getDependencies(projectId: string, user: UserWithRoles) {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user), deletedAt: null },
        });
        if (!project) throw new NotFoundException('Project not found');
        return this.prisma.taskDependency.findMany({
            where: { projectId },
            include: {
                predecessor: { select: { id: true, title: true } },
                successor: { select: { id: true, title: true } },
            },
        });
    }

    async addDependency(projectId: string, user: UserWithRoles, predecessorTaskId: string, successorTaskId: string) {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user), deletedAt: null },
        });
        if (!project) throw new NotFoundException('Project not found');
        if (predecessorTaskId === successorTaskId) {
            throw new NotFoundException('A task cannot depend on itself');
        }
        const [pred, succ] = await Promise.all([
            this.prisma.task.findFirst({ where: { id: predecessorTaskId, projectId, deletedAt: null } }),
            this.prisma.task.findFirst({ where: { id: successorTaskId, projectId, deletedAt: null } }),
        ]);
        if (!pred || !succ) throw new NotFoundException('Task not found');
        try {
            return await this.prisma.taskDependency.create({
                data: { projectId, predecessorTaskId, successorTaskId },
                include: {
                    predecessor: { select: { id: true, title: true } },
                    successor: { select: { id: true, title: true } },
                },
            });
        } catch (e: any) {
            if (e?.code === 'P2002') {
                throw new ConflictException('This dependency already exists');
            }
            throw e;
        }
    }

    async removeDependency(projectId: string, dependencyId: string, user: UserWithRoles) {
        const dep = await this.prisma.taskDependency.findFirst({
            where: { id: dependencyId, projectId },
        });
        if (!dep) throw new NotFoundException('Dependency not found');
        await this.prisma.project.findFirstOrThrow({
            where: { id: projectId, ...ScopeUtils.projectScope(user), deletedAt: null },
        });
        return this.prisma.taskDependency.delete({ where: { id: dependencyId } });
    }

    async exportCsv(projectId: string, user: UserWithRoles): Promise<string> {
        const tasks = await this.findAll(projectId, user);
        const header = 'Title,Status,Priority,Assignee,Due Date,Labels,Created\n';
        const escape = (v: unknown) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
        const rows = tasks.map((t) =>
            [
                escape(t.title),
                escape(t.status),
                escape(t.priority),
                escape(t.assignee?.name),
                t.dueDate ? escape(new Date(t.dueDate).toISOString().slice(0, 10)) : '',
                escape((t.labels || []).join('; ')),
                t.createdAt ? escape(new Date(t.createdAt).toISOString()) : '',
            ].join(','),
        );
        return header + rows.join('\n');
    }
}
