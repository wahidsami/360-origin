import { randomUUID } from 'crypto';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { ActivityService } from '../activity/activity.service';

type ProjectEnvironmentRow = {
    id: string;
    projectId: string;
    name: string;
    url: string;
    credentialsUsername: string | null;
    createdAt: Date;
    updatedAt: Date;
};

@Injectable()
export class ProjectsService {
    constructor(
        private prisma: PrismaService,
        private activityService: ActivityService,
    ) { }

    private isInternalManager(role: string) {
        return ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA', 'FINANCE'].includes(role);
    }

    private mapEnvironment(environment: any, user: UserWithRoles) {
        const exposeCredentials = this.isInternalManager(user.role);
        return {
            id: environment.id,
            projectId: environment.projectId,
            name: environment.name,
            url: environment.url,
            credentials: exposeCredentials && environment.credentialsUsername
                ? { username: environment.credentialsUsername }
                : undefined,
            createdAt: environment.createdAt,
            updatedAt: environment.updatedAt,
        };
    }

    private assertCanManageEnvironments(user: UserWithRoles) {
        if (!this.isInternalManager(user.role)) {
            throw new ForbiddenException('Only internal staff can manage environment access');
        }
    }

    private async resolveWorkspaceConfigDraft(
        user: UserWithRoles,
        clientId: string | undefined,
        workspaceConfigDraft:
            | {
                sourceTemplateId?: string;
                sourceTemplateVersion?: number;
                assignedClientId?: string;
                audienceType?: string;
                tabs?: unknown;
                overviewSections?: unknown;
            }
            | undefined,
    ) {
        const assignedWorkspaceTemplate = !workspaceConfigDraft?.sourceTemplateId && clientId
            ? await this.prisma.clientWorkspaceTemplateAssignment.findFirst({
                where: {
                    orgId: user.orgId,
                    clientId,
                    isActive: true,
                    isDefault: true,
                },
                include: {
                    template: true,
                },
                orderBy: [{ assignedAt: 'desc' }],
            }) || await this.prisma.clientWorkspaceTemplateAssignment.findFirst({
                where: {
                    orgId: user.orgId,
                    clientId,
                    isActive: true,
                },
                include: {
                    template: true,
                },
                orderBy: [{ assignedAt: 'desc' }],
            })
            : null;

        if (assignedWorkspaceTemplate) {
            return {
                sourceTemplateId: assignedWorkspaceTemplate.templateId,
                sourceTemplateVersion: undefined,
                assignedClientId: clientId,
                audienceType: assignedWorkspaceTemplate.template.audienceType.toLowerCase(),
                tabs: Array.isArray((assignedWorkspaceTemplate.template.definitionJson as any)?.tabs)
                    ? (assignedWorkspaceTemplate.template.definitionJson as any).tabs
                    : [],
                overviewSections: Array.isArray((assignedWorkspaceTemplate.template.definitionJson as any)?.overviewSections)
                    ? (assignedWorkspaceTemplate.template.definitionJson as any).overviewSections
                    : [],
            };
        }

        return workspaceConfigDraft;
    }

    async findAll(user: UserWithRoles, query: any) {
        const where: any = {
            ...ScopeUtils.projectScope(user), // Apply RBAC Project Scope
            deletedAt: null,
        };

        if (query.clientId) where.clientId = query.clientId;
        if (query.status) where.status = query.status;
        if (query.health) where.health = query.health;
        if (query.q) {
            where.name = { contains: query.q, mode: 'insensitive' };
        }

        return this.prisma.project.findMany({
            where,
            include: { client: true, _count: { select: { tasks: true } } },
        });
    }

    async findOne(id: string, user: UserWithRoles) {
        const project = await this.prisma.project.findFirst({
            where: {
                id,
                ...ScopeUtils.projectScope(user),
                deletedAt: null,
            },
            include: { client: true, members: true, workspaceConfig: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        return project;
    }

    async create(user: UserWithRoles, createDto: any) {
        // Normalize status and health
        const data: any = { ...createDto };
        if (data.status) data.status = data.status.toUpperCase().replace(/-/g, '_');
        if (data.health) data.health = data.health.toUpperCase().replace(/-/g, '_');

        // strict mapping for Prisma
        const startDate = data.startDate ? new Date(data.startDate) : new Date();
        const endDate = data.deadline ? new Date(data.deadline) : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        const workspaceConfigDraft = data.workspaceConfigDraft as
            | {
                sourceTemplateId?: string;
                sourceTemplateVersion?: number;
                assignedClientId?: string;
                audienceType?: string;
                tabs?: unknown;
                overviewSections?: unknown;
            }
            | undefined;

        const effectiveWorkspaceConfigDraft = await this.resolveWorkspaceConfigDraft(user, data.clientId, workspaceConfigDraft);

        const workspaceConfigCreate = effectiveWorkspaceConfigDraft
            ? {
                create: {
                    orgId: user.orgId,
                    sourceTemplateId: effectiveWorkspaceConfigDraft.sourceTemplateId || undefined,
                    sourceTemplateVersion: effectiveWorkspaceConfigDraft.sourceTemplateVersion ?? undefined,
                    assignedClientId: effectiveWorkspaceConfigDraft.assignedClientId || data.clientId,
                    audienceType: (effectiveWorkspaceConfigDraft.audienceType || 'client').toUpperCase() as any,
                    tabsJson: Array.isArray(effectiveWorkspaceConfigDraft.tabs) ? effectiveWorkspaceConfigDraft.tabs : [],
                    overviewSectionsJson: Array.isArray(effectiveWorkspaceConfigDraft.overviewSections) ? effectiveWorkspaceConfigDraft.overviewSections : [],
                    createdById: user.id,
                }
            }
            : undefined;

        return this.prisma.project.create({
            data: {
                name: data.name,
                description: data.description,
                status: data.status,
                health: data.health,
                progress: typeof data.progress === 'number' ? data.progress : 0,
                budget: (data.budget !== undefined && data.budget !== null && data.budget !== '') ? parseFloat(data.budget.toString()) : null,
                tags: Array.isArray(data.tags) ? data.tags : [],
                startDate,
                endDate,
                org: { connect: { id: user.orgId } },
                client: { connect: { id: data.clientId } },
                members: {
                    create: {
                        userId: user.id,
                        role: user.role as any
                    }
                },
                workspaceConfig: workspaceConfigCreate,
            },
            include: { workspaceConfig: true },
        });
    }

    async update(id: string, user: UserWithRoles, updateDto: any) {
        // Verify project exists and user has access
        const project = await this.findOne(id, user);

        // Normalize status and health
        const data: any = { ...updateDto };
        if (data.status) data.status = data.status.toUpperCase().replace(/-/g, '_');
        if (data.health) data.health = data.health.toUpperCase().replace(/-/g, '_');

        // Clean up empty IDs to prevent FK constraint failures
        if (data.clientId === '') data.clientId = undefined; // Don't update if empty

        // Client roles cannot update projects
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can update projects');
        }

        // Construct update data strictly
        const updateData: any = {
            name: data.name,
            description: data.description,
            status: data.status,
            health: data.health,
            progress: typeof data.progress === 'number' ? data.progress : undefined,
            budget: (data.budget !== undefined && data.budget !== null && data.budget !== '') ? parseFloat(data.budget.toString()) : undefined,
            tags: Array.isArray(data.tags) ? data.tags : undefined,
            updatedAt: new Date()
        };

        if (data.startDate) updateData.startDate = new Date(data.startDate);
        if (data.endDate) updateData.endDate = new Date(data.endDate);
        if (data.deadline) updateData.endDate = new Date(data.deadline);

        // Handle clientId update
        if (data.clientId && data.clientId !== '') {
            updateData.client = { connect: { id: data.clientId } };
        }

        const workspaceConfigDraft = data.workspaceConfigDraft as
            | {
                sourceTemplateId?: string;
                sourceTemplateVersion?: number;
                assignedClientId?: string;
                audienceType?: string;
                tabs?: unknown;
                overviewSections?: unknown;
            }
            | undefined;

        if (workspaceConfigDraft) {
            const effectiveWorkspaceConfigDraft = await this.resolveWorkspaceConfigDraft(
                user,
                data.clientId || project.clientId,
                workspaceConfigDraft,
            );

            updateData.workspaceConfig = {
                upsert: {
                    create: {
                        orgId: user.orgId,
                        sourceTemplateId: effectiveWorkspaceConfigDraft?.sourceTemplateId || undefined,
                        sourceTemplateVersion: effectiveWorkspaceConfigDraft?.sourceTemplateVersion ?? undefined,
                        assignedClientId: effectiveWorkspaceConfigDraft?.assignedClientId || data.clientId || project.clientId,
                        audienceType: ((effectiveWorkspaceConfigDraft?.audienceType || 'client').toUpperCase()) as any,
                        tabsJson: Array.isArray(effectiveWorkspaceConfigDraft?.tabs) ? effectiveWorkspaceConfigDraft?.tabs : [],
                        overviewSectionsJson: Array.isArray(effectiveWorkspaceConfigDraft?.overviewSections) ? effectiveWorkspaceConfigDraft?.overviewSections : [],
                        createdById: user.id,
                    },
                    update: {
                        sourceTemplateId: effectiveWorkspaceConfigDraft?.sourceTemplateId || null,
                        sourceTemplateVersion: effectiveWorkspaceConfigDraft?.sourceTemplateVersion ?? null,
                        assignedClientId: effectiveWorkspaceConfigDraft?.assignedClientId || data.clientId || project.clientId,
                        audienceType: ((effectiveWorkspaceConfigDraft?.audienceType || 'client').toUpperCase()) as any,
                        tabsJson: Array.isArray(effectiveWorkspaceConfigDraft?.tabs) ? effectiveWorkspaceConfigDraft?.tabs : [],
                        overviewSectionsJson: Array.isArray(effectiveWorkspaceConfigDraft?.overviewSections) ? effectiveWorkspaceConfigDraft?.overviewSections : [],
                        updatedAt: new Date(),
                    },
                }
            };
        }

        return this.prisma.project.update({
            where: { id },
            data: updateData,
            include: { workspaceConfig: true },
        });
    }

    async archive(id: string, user: UserWithRoles) {
        // Verify project exists and user has access
        await this.findOne(id, user);

        // Only SUPER_ADMIN, OPS, PM can archive
        const allowedRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can archive projects');
        }

        return this.prisma.project.update({
            where: { id },
            data: {
                status: 'ARCHIVED',
                updatedAt: new Date()
            }
        });
    }

    // --- Membership ---
    async getMembers(projectId: string) {
        return this.prisma.projectMember.findMany({
            where: { projectId },
            include: { user: { select: { id: true, name: true, email: true, role: true } } }
        });
    }

    async getEnvironments(projectId: string, user: UserWithRoles) {
        await this.findOne(projectId, user);
        const environments = await this.prisma.$queryRaw<ProjectEnvironmentRow[]>`
            SELECT
                id,
                "projectId",
                name,
                url,
                "credentialsUsername",
                "createdAt",
                "updatedAt"
            FROM "ProjectEnvironment"
            WHERE "projectId" = ${projectId}
              AND "orgId" = ${user.orgId}
            ORDER BY "createdAt" ASC
        `;
        return environments.map((environment) => this.mapEnvironment(environment, user));
    }

    async createEnvironment(projectId: string, user: UserWithRoles, payload: { name: string; url: string; username?: string | null }) {
        await this.findOne(projectId, user);
        this.assertCanManageEnvironments(user);

        const name = payload.name?.trim();
        const url = payload.url?.trim();
        if (!name || !url) {
            throw new BadRequestException('Environment name and URL are required');
        }

        const created = await this.prisma.$queryRaw<ProjectEnvironmentRow[]>`
            INSERT INTO "ProjectEnvironment" (
                id,
                "orgId",
                "projectId",
                name,
                url,
                "credentialsUsername",
                "createdAt",
                "updatedAt"
            ) VALUES (
                ${randomUUID()},
                ${user.orgId},
                ${projectId},
                ${name},
                ${url},
                ${payload.username?.trim() || null},
                NOW(),
                NOW()
            )
            RETURNING
                id,
                "projectId",
                name,
                url,
                "credentialsUsername",
                "createdAt",
                "updatedAt"
        `;
        const createdEnvironment = created[0];
        if (!createdEnvironment) {
            throw new InternalServerErrorException('Failed to create environment');
        }

        await this.activityService.create({
            orgId: user.orgId,
            projectId,
            userId: user.id,
            action: 'created',
            entityType: 'environment',
            entityId: createdEnvironment.id,
            description: `Created environment access ${createdEnvironment.name}`,
            metadata: { name: createdEnvironment.name, url: createdEnvironment.url },
        });

        return this.mapEnvironment(createdEnvironment, user);
    }

    async updateEnvironment(projectId: string, environmentId: string, user: UserWithRoles, payload: { name?: string; url?: string; username?: string | null }) {
        await this.findOne(projectId, user);
        this.assertCanManageEnvironments(user);

        const existingRows = await this.prisma.$queryRaw<ProjectEnvironmentRow[]>`
            SELECT
                id,
                "projectId",
                name,
                url,
                "credentialsUsername",
                "createdAt",
                "updatedAt"
            FROM "ProjectEnvironment"
            WHERE id = ${environmentId}
              AND "projectId" = ${projectId}
              AND "orgId" = ${user.orgId}
            LIMIT 1
        `;
        const existing = existingRows[0];
        if (!existing) throw new NotFoundException('Environment not found');

        const nextName = payload.name !== undefined
            ? (() => {
                const value = payload.name.trim();
                if (!value) throw new BadRequestException('Environment name cannot be empty');
                return value;
            })()
            : existing.name;
        const nextUrl = payload.url !== undefined
            ? (() => {
                const value = payload.url.trim();
                if (!value) throw new BadRequestException('Environment URL cannot be empty');
                return value;
            })()
            : existing.url;
        const nextUsername = payload.username !== undefined
            ? (payload.username?.trim() || null)
            : existing.credentialsUsername;

        const updatedRows = await this.prisma.$queryRaw<ProjectEnvironmentRow[]>`
            UPDATE "ProjectEnvironment"
            SET
                name = ${nextName},
                url = ${nextUrl},
                "credentialsUsername" = ${nextUsername},
                "updatedAt" = NOW()
            WHERE id = ${existing.id}
            RETURNING
                id,
                "projectId",
                name,
                url,
                "credentialsUsername",
                "createdAt",
                "updatedAt"
        `;
        const updated = updatedRows[0];
        if (!updated) {
            throw new InternalServerErrorException('Failed to update environment');
        }

        await this.activityService.create({
            orgId: user.orgId,
            projectId,
            userId: user.id,
            action: 'updated',
            entityType: 'environment',
            entityId: updated.id,
            description: `Updated environment access ${updated.name}`,
            metadata: { name: updated.name, url: updated.url },
        });

        return this.mapEnvironment(updated, user);
    }

    async deleteEnvironment(projectId: string, environmentId: string, user: UserWithRoles) {
        await this.findOne(projectId, user);
        this.assertCanManageEnvironments(user);

        const existingRows = await this.prisma.$queryRaw<ProjectEnvironmentRow[]>`
            SELECT
                id,
                "projectId",
                name,
                url,
                "credentialsUsername",
                "createdAt",
                "updatedAt"
            FROM "ProjectEnvironment"
            WHERE id = ${environmentId}
              AND "projectId" = ${projectId}
              AND "orgId" = ${user.orgId}
            LIMIT 1
        `;
        const existing = existingRows[0];
        if (!existing) throw new NotFoundException('Environment not found');

        await this.prisma.$queryRaw`
            DELETE FROM "ProjectEnvironment"
            WHERE id = ${existing.id}
        `;

        await this.activityService.create({
            orgId: user.orgId,
            projectId,
            userId: user.id,
            action: 'deleted',
            entityType: 'environment',
            entityId: existing.id,
            description: `Deleted environment access ${existing.name}`,
            metadata: { name: existing.name, url: existing.url },
        });

        return { success: true };
    }

    async addMember(projectId: string, userId: string, role: any) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project) throw new NotFoundException('Project not found');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        // Check if already exists
        const existing = await this.prisma.projectMember.findFirst({
            where: { projectId, userId }
        });

        if (existing) {
            return this.prisma.projectMember.update({
                where: { id: existing.id },
                data: { role }
            });
        }

        return this.prisma.projectMember.create({
            data: {
                projectId,
                userId,
                role
            }
        });
    }

    async updateMemberRole(projectId: string, userId: string, role: any) {
        // Find exact record
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId }
        });

        if (!member) throw new NotFoundException('Member not found in project');

        return this.prisma.projectMember.update({
            where: { id: member.id },
            data: { role }
        });
    }

    async remove(id: string, user: UserWithRoles) {
        await this.findOne(id, user);
        return this.prisma.project.update({
            where: { id },
            data: { deletedAt: new Date() }
        });
    }

    async removeMember(projectId: string, userId: string) {
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId }
        });

        if (member) {
            await this.prisma.projectMember.delete({ where: { id: member.id } });
        }
        return { success: true };
    }

    async getActivity(projectId: string, user: UserWithRoles) {
        return this.activityService.findByProject(projectId, user);
    }

    async getReadiness(id: string, user: UserWithRoles) {
        const project = await this.prisma.project.findUnique({
            where: { id },
            include: {
                client: true,
                members: true,
                milestones: true,
                tasks: true,
                taskDependencies: true,
                updates: true,
                files: true,
                findings: true,
                reports: true,
                contracts: true,
                invoices: true,
                sprints: true,
                recurringTaskTemplates: true,
            }
        });

        if (!project) throw new NotFoundException('Project not found');

        const timeEntriesCount = await this.prisma.timeEntry.count({
            where: { taskId: { in: project.tasks.map(t => t.id) } }
        });
        const environmentCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count
            FROM "ProjectEnvironment"
            WHERE "projectId" = ${id}
              AND "orgId" = ${user.orgId}
        `;
        const hasEnvironments = Number(environmentCount[0]?.count || 0) > 0;

        // Scrub Financial Data for DEV Role
        if (user.role === 'DEV') {
            project.contracts = [];
            project.invoices = [];
        }

        // 1. CORE SECTION
        const coreItems = [
            { id: 'name', label: 'Project Name', status: !!project.name ? 'complete' : 'missing', type: 'required', tab: 'overview', action: { type: 'open_edit_project' } },
            { id: 'client', label: 'Client Assignment', status: !!project.clientId ? 'complete' : 'missing', type: 'required', tab: 'overview', action: { type: 'open_edit_project' } },
            { id: 'description', label: 'Project Description', status: !!project.description ? 'complete' : 'missing', type: 'required', tab: 'overview', action: { type: 'open_edit_project' } },
            { id: 'startDate', label: 'Start Date', status: !!project.startDate ? 'complete' : 'missing', type: 'required', tab: 'overview', action: { type: 'open_edit_project' } },
            { id: 'deadline', label: 'Project Deadline', status: !!project.endDate ? 'complete' : 'missing', type: 'required', tab: 'overview', action: { type: 'open_edit_project' } },
            { id: 'team', label: 'Team Members', status: project.members.length > 0 ? 'complete' : 'missing', type: 'required', tab: 'team', action: { type: 'navigate_tab', target: 'team' } },
            { id: 'milestones', label: 'Milestones', status: project.milestones.length > 0 ? 'complete' : 'missing', type: 'required', tab: 'milestones', action: { type: 'navigate_tab', target: 'milestones' } },
            { id: 'tasks', label: 'Project Tasks', status: project.tasks.length > 0 ? 'complete' : 'missing', type: 'required', tab: 'tasks', action: { type: 'navigate_tab', target: 'tasks' } },
        ];

        // 2. PLANNING SECTION
        const planningItems = [
            { id: 'timeline', label: 'Timeline Configuration', status: (project.tasks.some(t => t.startDate && t.dueDate) || project.taskDependencies.length > 0) ? 'complete' : 'missing', type: 'conditional', tab: 'timeline', action: { type: 'navigate_tab', target: 'timeline' } },
            { id: 'sprints', label: 'Sprint Planning', status: project.sprints.length > 0 ? 'complete' : 'missing', type: 'conditional', tab: 'sprints', action: { type: 'navigate_tab', target: 'sprints' } },
            { id: 'recurring', label: 'Recurring Tasks', status: project.recurringTaskTemplates.length > 0 ? 'complete' : 'missing', type: 'conditional', tab: 'recurring', action: { type: 'navigate_tab', target: 'recurring' } },
            { id: 'findings', label: 'Open Findings', status: project.findings.length === 0 ? 'not_applicable' : project.findings.every(f => f.status === 'CLOSED' || f.status === 'DISMISSED') ? 'complete' : 'missing', type: 'conditional', tab: 'findings', action: { type: 'navigate_tab', target: 'findings' } },
            { id: 'reports', label: 'Delivery Reports', status: project.reports.length > 0 ? 'complete' : 'missing', type: 'conditional', tab: 'reports', action: { type: 'navigate_tab', target: 'reports' } },
            { id: 'time', label: 'Time Tracking', status: timeEntriesCount > 0 ? 'complete' : 'missing', type: 'conditional', tab: 'time', action: { type: 'navigate_tab', target: 'time' } },
        ];

        // 3. RESOURCES SECTION
        const resourcesItems = [
            { id: 'files', label: 'Required Files', status: project.files.length > 0 ? 'complete' : 'missing', type: 'required', tab: 'files', action: { type: 'navigate_tab', target: 'files' } },
            { id: 'financials', label: 'Financial Setup', status: (project.contracts.length > 0 || project.invoices.length > 0) ? 'complete' : 'missing', type: 'conditional', tab: 'financials', action: { type: 'navigate_tab', target: 'financials' } },
            { id: 'testing', label: 'Testing Access', status: hasEnvironments ? 'complete' : 'missing', type: 'conditional', tab: 'testing', action: { type: 'navigate_tab', target: 'testing' } },
        ];

        // Stats
        const stats = {
            totalRequired: coreItems.filter(i => i.type === 'required').length + resourcesItems.filter(i => i.type === 'required').length,
            completedRequired: coreItems.filter(i => i.type === 'required' && i.status === 'complete').length + resourcesItems.filter(i => i.type === 'required' && i.status === 'complete').length,
            totalConditional: planningItems.length + coreItems.filter(i => i.type === 'conditional').length + resourcesItems.filter(i => i.type === 'conditional').length,
            completedConditional: planningItems.filter(i => i.status === 'complete').length + coreItems.filter(i => i.type === 'conditional' && i.status === 'complete').length + resourcesItems.filter(i => i.type === 'conditional' && i.status === 'complete').length,
        };

        const completeness = Math.round((stats.completedRequired / stats.totalRequired) * 100);

        // Stage Logic
        let stage = 'SETUP' as any;
        let stageExplanation = 'Initial project parameters and team setup required.';

        const coreRequiredReady = coreItems.filter(i => i.type === 'required').every(i => i.status === 'complete');

        if (coreRequiredReady) {
            stage = 'PLANNING';
            stageExplanation = 'Core setup complete. Define milestones and delivery schedule.';
            if (project.tasks.length > 0 && (project.status === 'ACTIVE' || project.status === 'IN_PROGRESS')) {
                stage = 'ACTIVE';
                stageExplanation = 'Project execution in progress. Track tasks and post updates.';
            }
            if (project.status === 'TESTING' || (project.findings.length > 0 && project.findings.some(f => f.status !== 'CLOSED'))) {
                stage = 'REVIEW';
                stageExplanation = 'Reviewing findings and testing deliverables.';
            }
            if (project.status === 'COMPLETED' || project.status === 'DEPLOYED') {
                stage = 'DONE';
                stageExplanation = 'Project deliverables accepted and project closed.';
                const hasPaidInvoices = project.invoices.some(i => i.status === 'PAID');
                if (hasPaidInvoices) {
                    stage = 'READY_FOR_BILLING';
                    stageExplanation = 'Project complete and financials are ready for final audit.';
                }
            }
        }

        // Enhanced Primary Action Intelligence Logic
        let nextAction: any = null;

        // Priority 1: Critical findings with context
        const criticalFindings = project.findings.filter(
            f => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.status !== 'CLOSED' && f.status !== 'DISMISSED'
        );
        if (criticalFindings.length > 0) {
            const blockingTasks = project.tasks.filter(t =>
                criticalFindings.some(f => f.id === t.id) // simplistic assumption for affectedTasks matching
            );
            nextAction = {
                type: 'critical_findings',
                title: 'Critical Issues Blocking Progress',
                description: `${criticalFindings.length} critical finding(s) require action`,
                details: {
                    findings: criticalFindings.map(f => f.title),
                    affectedTasks: blockingTasks.length,
                    recommendation: blockingTasks.length > 0
                        ? 'Resolve findings to unblock tasks'
                        : 'Address findings to prevent future issues'
                },
                actions: [
                    { label: 'Review Findings', route: 'findings', primary: true },
                    { label: 'View Affected Tasks', route: 'tasks', filter: 'blocked' }
                ]
            };
        } else {
            // Priority 2: Overdue tasks with impact analysis
            const overdueTasks = project.tasks.filter(
                t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < new Date()
            );
            if (overdueTasks.length > 0) {
                const dependentTasks = project.tasks.filter(t =>
                    (t as any).dependencies?.some((d: any) => overdueTasks.some(ot => ot.id === d.dependsOnId))
                ) || [];
                const affectedMilestones = project.milestones.filter(m =>
                    (m as any).tasks?.some((mt: any) => overdueTasks.some(ot => ot.id === mt.id))
                ) || [];

                nextAction = {
                    type: 'overdue_tasks',
                    title: `${overdueTasks.length} Task(s) Past Deadline`,
                    description: `Impacting ${affectedMilestones.length} milestone(s) and blocking ${dependentTasks.length} task(s)`,
                    details: {
                        mostOverdue: overdueTasks.sort((a, b) =>
                            new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
                        )[0],
                        totalDaysLate: overdueTasks.reduce((sum, t) =>
                            sum + Math.floor((new Date().getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24)), 0
                        ),
                        recommendation: dependentTasks.length > 0
                            ? `Prioritize tasks blocking ${dependentTasks.length} other items`
                            : 'Update task status or extend deadlines'
                    },
                    actions: [
                        { label: 'Address Overdue Tasks', route: 'tasks', filter: 'overdue', primary: true },
                        { label: 'Adjust Schedule', route: 'milestones' }
                    ]
                };
            } else {
                // Priority 3: At-risk milestones
                const atRiskMilestones = project.milestones.filter(
                    m => m.status !== 'COMPLETED' && m.dueDate && new Date(m.dueDate) < new Date()
                );
                if (atRiskMilestones.length > 0) {
                    nextAction = {
                        type: 'at_risk_milestones',
                        title: `${atRiskMilestones.length} Milestone(s) Missed`,
                        description: atRiskMilestones.map(m => m.title).join(', '),
                        details: {
                            oldestMissed: Math.floor(
                                (new Date().getTime() - new Date(atRiskMilestones[0].dueDate!).getTime()) / (1000 * 60 * 60 * 24)
                            ),
                            recommendation: 'Update milestone status or reschedule project timeline'
                        },
                        actions: [
                            { label: 'Update Milestones', route: 'milestones', primary: true },
                            { label: 'Adjust Timeline', route: 'timeline' }
                        ]
                    };
                } else {
                    // Priority 4: Communication gaps
                    const lastUpdate = project.updates[0];
                    const daysSinceUpdate = lastUpdate
                        ? Math.floor((new Date().getTime() - new Date(lastUpdate.createdAt).getTime()) / (1000 * 60 * 60 * 24))
                        : null;

                    if ((project.status === 'ACTIVE' || project.status === 'IN_PROGRESS') && (daysSinceUpdate === null || daysSinceUpdate > 7)) {
                        nextAction = {
                            type: 'stale_communication',
                            title: 'Project Update Needed',
                            description: daysSinceUpdate !== null ? `Last update was ${daysSinceUpdate} days ago` : 'No project updates posted yet',
                            details: {
                                recommendation: 'Post weekly updates to keep stakeholders informed'
                            },
                            actions: [
                                { label: 'Post Update', route: 'updates', primary: true }
                            ]
                        };
                    } else {
                        // Priority 5: Required Core/Resource Items (Setup Blockers)
                        const firstMissingCore = coreItems.find(i => i.status === 'missing' && i.type === 'required');
                        const firstMissingResource = resourcesItems.find(i => i.status === 'missing' && i.type === 'required');

                        if (firstMissingCore) {
                            nextAction = {
                                type: 'setup_required',
                                title: `${firstMissingCore.label} Missing`,
                                description: `Required item from Core Setup is missing.`,
                                details: { recommendation: 'Complete core setup to unblock planning' },
                                actions: [{ label: 'Complete Setup', route: firstMissingCore.tab, primary: true }]
                            };
                        } else if (firstMissingResource) {
                            nextAction = {
                                type: 'setup_required',
                                title: `${firstMissingResource.label} Missing`,
                                description: `Required item from Resources is missing.`,
                                details: { recommendation: 'Upload necessary resources to proceed' },
                                actions: [{ label: 'Complete Setup', route: firstMissingResource.tab, primary: true }]
                            };
                        } else if (stage === 'PLANNING' && planningItems.some(i => i.status === 'missing')) {
                            const firstPlanning = planningItems.find(i => i.status === 'missing');
                            nextAction = {
                                type: 'planning_required',
                                title: `${firstPlanning?.label || 'Timeline'} Missing`,
                                description: `Define the schedule for project delivery.`,
                                details: { recommendation: 'Complete planning modules' },
                                actions: [{ label: 'Configure Planning', route: firstPlanning?.tab || 'timeline', primary: true }]
                            };
                        } else {
                            // Default action
                            nextAction = {
                                type: 'on_track',
                                title: 'Project On Track',
                                description: 'All major requirements and tasks are up to date.',
                                details: { recommendation: 'Review team discussions or adjust timeline as needed.' },
                                actions: [{ label: 'View Discussions', route: 'discussions', primary: true }]
                            };
                        }
                    }
                }
            }
        }

        return {
            stage,
            stageExplanation,
            sections: {
                core: {
                    items: coreItems,
                    summary: `${coreItems.filter(i => i.status === 'complete').length} of ${coreItems.length} core parameters set.`
                },
                planning: {
                    items: planningItems,
                    summary: `${planningItems.filter(i => i.status === 'complete').length} of ${planningItems.length} planning modules active.`
                },
                resources: {
                    items: resourcesItems,
                    summary: `${resourcesItems.filter(i => i.status === 'complete').length} of ${resourcesItems.length} resources available.`
                },
            },
            nextAction,
            stats,
            completeness
        };
    }

    async getMetrics(id: string, user: UserWithRoles) {
        const project = await this.prisma.project.findUnique({
            where: { id },
            include: {
                invoices: true,
                contracts: true,
                members: { include: { user: true } },
                tasks: true,
                findings: true
            }
        });

        if (!project) throw new NotFoundException('Project not found');

        // 1. Budget
        let totalBudget = 0;
        let spent = 0;
        
        if (user.role !== 'DEV') {
            totalBudget = project.budget || project.contracts.reduce((sum: number, c: any) => sum + (+c.amount || 0), 0);
            spent = project.invoices.filter((i: any) => i.status?.toLowerCase() === 'paid').reduce((sum: number, i: any) => sum + (+i.amount || 0), 0);
        }

        const remaining = Math.max(0, totalBudget - spent);
        const percentSpent = totalBudget > 0 ? (spent / totalBudget) * 100 : (spent > 0 ? 100 : 0);

        const budget = {
            total: totalBudget,
            spent,
            remaining,
            percentSpent: Math.round(percentSpent),
            isOverBudget: percentSpent > 100
        };

        // 2. Capacity
        const capacityMembers = project.members.map((member: any) => {
            const assignedTasks = project.tasks.filter((t: any) => t.assigneeId === member.userId && t.status?.toUpperCase() !== 'DONE');
            const taskCount = assignedTasks.length;

            return {
                id: member.userId,
                name: member.user.name,
                taskCount,
                status: taskCount === 0 ? 'available' :
                    taskCount <= 3 ? 'low' :
                        taskCount <= 5 ? 'medium' : 'high'
            };
        }).sort((a: any, b: any) => b.taskCount - a.taskCount);

        const capacity = {
            members: capacityMembers,
            highLoad: capacityMembers.filter((m: any) => m.status === 'high'),
            available: capacityMembers.filter((m: any) => m.status === 'available')
        };

        // 3. Blockers
        const activeBlockers: any[] = [];

        // Add blocked tasks
        const blockedTasks = project.tasks.filter((t: any) => t.status?.toUpperCase() === 'BLOCKED');
        for (const bt of blockedTasks) {
            activeBlockers.push({ id: bt.id, title: `Task Blocked: ${bt.title}` });
        }

        // Add critical findings (if we wanted to extend blockers, but to keep it simple, just tasks for now)
        const criticalFindings = project.findings?.filter((f: any) => f.status === 'OPEN' && f.severity === 'CRITICAL') || [];
        for (const cf of criticalFindings) {
            activeBlockers.push({ id: cf.id, title: `Critical Finding: ${cf.title}` });
        }

        const blockers = {
            active: activeBlockers,
            resolved: []
        };

        return {
            budget,
            capacity,
            blockers
        };
    }
}
