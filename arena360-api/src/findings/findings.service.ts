import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UserWithRoles, ScopeUtils } from '../common/utils/scope.utils';
import { CreateFindingDto, UpdateFindingDto } from './dto/finding.dto';
import { AutomationService } from '../automation/automation.service';
import { AutomationTriggerEntity, AutomationTriggerEvent } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { SlaService } from '../sla/sla.service';

@Injectable()
export class FindingsService {
    constructor(
        private prisma: PrismaService,
        private automation: AutomationService,
        private activity: ActivityService,
        private sla: SlaService,
    ) { }

    async findAll(projectId: string, user: UserWithRoles) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { 
                id: projectId, 
                ...ScopeUtils.projectScope(user) 
            }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.finding.findMany({
            where: {
                projectId,
                orgId: user.orgId,
                deletedAt: null,
                // Client users only see CLIENT visibility findings
                ...(isClientUser && { visibility: 'CLIENT' })
            },
            include: {
                project: {
                    select: { name: true }
                },
                reportedBy: {
                    select: { id: true, name: true, email: true }
                },
                assignedTo: {
                    select: { id: true, name: true, email: true }
                },
                evidence: true
            },
            orderBy: [
                { severity: 'desc' }, // CRITICAL first
                { createdAt: 'desc' }
            ]
        });
    }

    async findOne(id: string, user: UserWithRoles) {
        const finding = await this.prisma.finding.findFirst({
            where: {
                id,
                orgId: user.orgId,
                deletedAt: null,
                project: {
                    ...ScopeUtils.projectScope(user)
                }
            },
            include: {
                project: {
                    select: {
                        id: true,
                        name: true,
                        clientId: true,
                        client: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    }
                },
                reportedBy: {
                    select: { id: true, name: true, email: true }
                },
                assignedTo: {
                    select: { id: true, name: true, email: true }
                },
                evidence: true
            }
        });

        if (!finding) {
            throw new NotFoundException('Finding not found');
        }

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        if (isClientUser && finding.visibility === 'INTERNAL') {
            throw new ForbiddenException('You do not have access to this finding');
        }

        const timelineFeeds = await this.prisma.activityFeed.findMany({
            where: {
                orgId: user.orgId,
                entityType: 'finding',
                entityId: id,
            },
            orderBy: { createdAt: 'asc' },
        });

        const timelineUserIds = [...new Set(timelineFeeds.map((feed) => feed.userId))];
        const timelineUsers = timelineUserIds.length
            ? await this.prisma.user.findMany({
                where: { id: { in: timelineUserIds } },
                select: { id: true, name: true },
            })
            : [];

        const timelineUserMap = new Map(timelineUsers.map((entry) => [entry.id, entry.name]));

        return {
            ...finding,
            timeline: timelineFeeds.map((feed) => ({
                id: feed.id,
                action: feed.action,
                user: timelineUserMap.get(feed.userId) ?? 'System',
                date: feed.createdAt.toISOString(),
                detail: feed.description,
            })),
        };
    }

    async findAllGlobal(user: UserWithRoles) {
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.finding.findMany({
            where: {
                orgId: user.orgId,
                deletedAt: null,
                project: {
                    ...ScopeUtils.projectScope(user)
                },
                // Client users only see CLIENT visibility findings
                ...(isClientUser && { visibility: 'CLIENT' })
            },
            include: {
                project: {
                    select: { id: true, name: true, clientId: true }
                },
                reportedBy: {
                    select: { id: true, name: true, email: true }
                },
                assignedTo: {
                    select: { id: true, name: true, email: true }
                },
                evidence: true
            },
            orderBy: [
                { severity: 'desc' }, // CRITICAL first
                { createdAt: 'desc' }
            ]
        });
    }

    async exportCsv(user: UserWithRoles): Promise<string> {
        const findings = await this.findAllGlobal(user);
        const header = 'Title,Project,Severity,Status,Reported By,Assigned To,Created\n';
        const escape = (v: unknown) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
        const rows = findings.map((f: any) =>
            [
                escape(f.title),
                escape(f.project?.name),
                escape(f.severity),
                escape(f.status),
                escape(f.reportedBy?.name),
                escape(f.assignedTo?.name),
                f.createdAt ? escape(new Date(f.createdAt).toISOString()) : '',
            ].join(','),
        );
        return header + rows.join('\n');
    }

    async create(projectId: string, user: UserWithRoles, dto: CreateFindingDto) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { 
                id: projectId, 
                ...ScopeUtils.projectScope(user) 
            }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Only internal roles can create findings
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can create findings');
        }

        // QA and DEV can only create INTERNAL findings
        const visibility = dto.visibility || 'INTERNAL';
        if (['DEV', 'QA'].includes(user.role) && visibility === 'CLIENT') {
            throw new ForbiddenException('DEV and QA roles can only create INTERNAL findings');
        }

        const finding = await this.prisma.finding.create({
            data: {
                ...dto,
                visibility,
                projectId,
                reportedById: user.id,
                orgId: user.orgId
            },
            include: {
                reportedBy: {
                    select: { id: true, name: true, email: true }
                },
                assignedTo: {
                    select: { id: true, name: true, email: true }
                },
                evidence: true
            }
        });
        this.sla.startOrUpdateTracker(project.orgId, 'FINDING', finding.id, { clientId: project.clientId }).catch(() => { });
        if (finding.status === 'CLOSED' || finding.status === 'DISMISSED') {
            this.sla.markMet(project.orgId, 'FINDING', finding.id).catch(() => { });
        }
        const entity = { id: finding.id, projectId, title: finding.title, status: finding.status, assignedToId: finding.assignedToId };
        this.automation.evaluateRules({
            orgId: project.orgId,
            entityType: AutomationTriggerEntity.FINDING,
            entityId: finding.id,
            event: AutomationTriggerEvent.CREATED,
            entity,
        }).catch(() => { });
        if (finding.assignedToId) {
            this.automation.evaluateRules({
                orgId: project.orgId,
                entityType: AutomationTriggerEntity.FINDING,
                entityId: finding.id,
                event: AutomationTriggerEvent.ASSIGNED,
                entity,
            }).catch(() => { });
        }
        this.logFindingActivity(projectId, project.orgId, user.id, 'finding.created', finding, `Finding "${finding.title}" reported`).catch(() => { });
        return finding;
    }

    private async logFindingActivity(projectId: string, orgId: string, userId: string, action: string, finding: { id: string; title: string }, description: string) {
        this.activity.create({
            orgId,
            projectId,
            userId,
            action,
            entityType: 'finding',
            entityId: finding.id,
            description,
            metadata: { title: finding.title },
        }).catch(() => { });
    }

    async update(projectId: string, findingId: string, user: UserWithRoles, dto: UpdateFindingDto) {
        // Verify finding exists and belongs to project
        const finding = await this.prisma.finding.findFirst({
            where: {
                id: findingId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!finding) {
            throw new NotFoundException('Finding not found');
        }

        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can update findings');
        }

        if (['DEV', 'QA'].includes(user.role) && dto.visibility === 'CLIENT') {
            throw new ForbiddenException('DEV and QA roles cannot make findings visible to clients');
        }

        // DEV can update status but not visibility (restricted update)
        if (user.role === 'DEV') {
            // DEV can only update status, assignedToId, severity, remediation, impact
            const allowedUpdates: Partial<UpdateFindingDto> = {};
            if (dto.status !== undefined) allowedUpdates.status = dto.status;
            if (dto.severity !== undefined) allowedUpdates.severity = dto.severity;
            if (dto.assignedToId !== undefined) allowedUpdates.assignedToId = dto.assignedToId;
            if (dto.remediation !== undefined) allowedUpdates.remediation = dto.remediation;
            if (dto.impact !== undefined) allowedUpdates.impact = dto.impact;

            // If trying to update other fields, deny
            const attemptedFields = Object.keys(dto);
            const allowedFields = ['status', 'severity', 'assignedToId', 'remediation', 'impact'];
            const unauthorized = attemptedFields.filter(f => !allowedFields.includes(f));

            if (unauthorized.length > 0) {
                throw new ForbiddenException('DEV role can only update status, severity, and assignedToId');
            }

            const updated = await this.prisma.finding.update({
                where: { id: findingId },
                data: allowedUpdates,
                include: {
                    reportedBy: {
                        select: { id: true, name: true, email: true }
                    },
                    assignedTo: {
                        select: { id: true, name: true, email: true }
                    },
                    evidence: true
                }
            });
            const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true, clientId: true } });
            const entity = {
                ...updated,
                projectId,
                project: { id: projectId, name: project?.name },
                assignedTo: updated.assignedTo ? { id: updated.assignedTo.id, name: updated.assignedTo.name } : null
            };
            if (dto.assignedToId !== undefined && dto.assignedToId !== finding.assignedToId) {
                this.automation.evaluateRules({
                    orgId: finding.orgId,
                    entityType: AutomationTriggerEntity.FINDING,
                    entityId: findingId,
                    event: AutomationTriggerEvent.ASSIGNED,
                    entity,
                    previousEntity: { assignedToId: finding.assignedToId, status: finding.status },
                }).catch(() => { });
            }
            if (dto.status !== undefined && dto.status !== finding.status) {
                this.automation.evaluateRules({
                    orgId: finding.orgId,
                    entityType: AutomationTriggerEntity.FINDING,
                    entityId: findingId,
                    event: AutomationTriggerEvent.STATUS_CHANGED,
                    entity,
                    previousEntity: { assignedToId: finding.assignedToId, status: finding.status },
                }).catch(() => { });
            }

            if (dto.status !== undefined && dto.status !== finding.status) {
                if (dto.status === 'CLOSED' || dto.status === 'DISMISSED') {
                    this.sla.markMet(finding.orgId, 'FINDING', findingId).catch(() => { });
                } else {
                    this.sla.startOrUpdateTracker(finding.orgId, 'FINDING', findingId, { clientId: project?.clientId }).catch(() => { });
                }
            }

            // Always trigger UPDATED event
            this.automation.evaluateRules({
                orgId: finding.orgId,
                entityType: AutomationTriggerEntity.FINDING,
                entityId: findingId,
                event: AutomationTriggerEvent.UPDATED,
                entity,
                previousEntity: { assignedToId: finding.assignedToId, status: finding.status },
            }).catch(() => { });
            this.logFindingActivity(projectId, finding.orgId, user.id, 'finding.updated', updated, `Finding "${updated.title}" updated`).catch(() => { });
            return updated;
        }

        // PM/OPS/SUPER_ADMIN can update all fields
        const updated = await this.prisma.finding.update({
            where: { id: findingId },
            data: dto,
            include: {
                reportedBy: {
                    select: { id: true, name: true, email: true }
                },
                assignedTo: {
                    select: { id: true, name: true, email: true }
                },
                evidence: true
            }
        });
        const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true, clientId: true } });
        const entity = {
            ...updated,
            projectId,
            project: { id: projectId, name: project?.name },
            assignedTo: updated.assignedTo ? { id: updated.assignedTo.id, name: updated.assignedTo.name } : null
        };
        if (dto.assignedToId !== undefined && dto.assignedToId !== finding.assignedToId) {
            this.automation.evaluateRules({
                orgId: finding.orgId,
                entityType: AutomationTriggerEntity.FINDING,
                entityId: findingId,
                event: AutomationTriggerEvent.ASSIGNED,
                entity,
                previousEntity: { assignedToId: finding.assignedToId, status: finding.status },
            }).catch(() => { });
        }
        if (dto.status !== undefined && dto.status !== finding.status) {
            this.automation.evaluateRules({
                orgId: finding.orgId,
                entityType: AutomationTriggerEntity.FINDING,
                entityId: findingId,
                event: AutomationTriggerEvent.STATUS_CHANGED,
                entity,
                previousEntity: { assignedToId: finding.assignedToId, status: finding.status },
            }).catch(() => { });
        }

        if (dto.status !== undefined && dto.status !== finding.status) {
            if (dto.status === 'CLOSED' || dto.status === 'DISMISSED') {
                this.sla.markMet(finding.orgId, 'FINDING', findingId).catch(() => { });
            } else {
                this.sla.startOrUpdateTracker(finding.orgId, 'FINDING', findingId, { clientId: project?.clientId }).catch(() => { });
            }
        }

        // Always trigger UPDATED event
        this.automation.evaluateRules({
            orgId: finding.orgId,
            entityType: AutomationTriggerEntity.FINDING,
            entityId: findingId,
            event: AutomationTriggerEvent.UPDATED,
            entity,
            previousEntity: { assignedToId: finding.assignedToId, status: finding.status },
        }).catch(() => { });
        this.logFindingActivity(projectId, finding.orgId, user.id, 'finding.updated', updated, `Finding "${updated.title}" updated`).catch(() => { });
        return updated;
    }


    async createComment(findingId: string, user: UserWithRoles, dto: any) {
        // Verify finding access
        await this.findOne(findingId, user);

        return this.prisma.findingComment.create({
            data: {
                content: dto.content,
                findingId,
                authorId: user.id,
                orgId: user.orgId,
                parentId: dto.parentId
            },
            include: {
                author: {
                    select: { id: true, name: true, avatar: true, role: true }
                }
            }
        });
    }

    async findAllComments(findingId: string, user: UserWithRoles) {
        // Verify finding access
        await this.findOne(findingId, user);

        return this.prisma.findingComment.findMany({
            where: {
                findingId,
                deletedAt: null
            },
            include: {
                author: {
                    select: { id: true, name: true, avatar: true, role: true }
                },
                replies: {
                    where: { deletedAt: null },
                    include: {
                        author: {
                            select: { id: true, name: true, avatar: true, role: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
    }

    async delete(projectId: string, findingId: string, user: UserWithRoles) {
        // Verify finding exists and belongs to project
        const finding = await this.prisma.finding.findFirst({
            where: {
                id: findingId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!finding) {
            throw new NotFoundException('Finding not found');
        }

        // Only PM/OPS/SUPER_ADMIN can delete findings (DEV cannot)
        const adminRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!adminRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can delete findings');
        }

        await this.prisma.finding.update({
            where: { id: findingId },
            data: { deletedAt: new Date() }
        });
        this.sla.markMet(finding.orgId, 'FINDING', findingId).catch(() => { });
        return { success: true };
    }
}
