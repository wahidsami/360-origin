import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UserWithRoles } from '../common/utils/scope.utils';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class ContractsService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private activity: ActivityService,
    ) { }

    private readonly financeNoticeRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'FINANCE'];

    private async getProjectRecipientIds(projectId: string, roles: string[] = this.financeNoticeRoles) {
        const members = await this.prisma.projectMember.findMany({
            where: { projectId, role: { in: roles as any } },
            select: { userId: true, user: { select: { isActive: true } } },
        });
        return [...new Set(members.filter((member) => member.user?.isActive !== false).map((member) => member.userId))];
    }

    private async notifyFinanceTeam(projectId: string, orgId: string, title: string, body: string, linkUrl: string) {
        const recipientIds = await this.getProjectRecipientIds(projectId);
        for (const userId of recipientIds) {
            await this.notifications.create({
                orgId,
                userId,
                type: 'INVOICE_OVERDUE',
                title,
                body,
                linkUrl,
                entityType: 'contract',
            }).catch(() => { });
        }
    }

    private async logActivity(orgId: string, projectId: string, action: string, entityId: string, description: string, metadata?: Record<string, unknown>) {
        await this.activity.create({
            orgId,
            projectId,
            userId: 'system',
            action,
            entityType: 'contract',
            entityId,
            description,
            metadata,
        }).catch(() => { });
    }

    async findAll(projectId: string, user: UserWithRoles) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, orgId: user.orgId }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Client users cannot view contracts — return empty list instead of throwing
        // so the project overview page doesn't crash for them.
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        if (clientRoles.includes(user.role)) {
            return [];
        }

        return this.prisma.contract.findMany({
            where: {
                projectId,
                orgId: user.orgId
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                invoices: {
                    select: { id: true, invoiceNumber: true, amount: true, status: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async create(projectId: string, user: UserWithRoles, dto: CreateContractDto) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, orgId: user.orgId }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Only PM/OPS/SUPER_ADMIN can create contracts
        const adminRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!adminRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can create contracts');
        }

        const contract = await this.prisma.contract.create({
            data: {
                ...dto,
                startDate: new Date(dto.startDate),
                endDate: dto.endDate ? new Date(dto.endDate) : null,
                projectId,
                createdById: user.id,
                orgId: user.orgId
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
        await this.logActivity(user.orgId, projectId, 'contract.created', contract.id, `Contract "${contract.title}" created.`, {
            contractId: contract.id,
            amount: contract.amount,
            status: contract.status,
        });
        await this.notifyFinanceTeam(projectId, user.orgId, 'Contract created', `Contract "${contract.title}" was created.`, `/app/projects/${projectId}?tab=financials`);
        return contract;
    }

    async update(projectId: string, contractId: string, user: UserWithRoles, dto: UpdateContractDto) {
        // Verify contract exists and belongs to project
        const contract = await this.prisma.contract.findFirst({
            where: {
                id: contractId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!contract) {
            throw new NotFoundException('Contract not found');
        }

        // Only PM/OPS/SUPER_ADMIN can update contracts
        const adminRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!adminRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can update contracts');
        }

        const updateData: any = { ...dto };
        if (dto.startDate) updateData.startDate = new Date(dto.startDate);
        if (dto.endDate) updateData.endDate = new Date(dto.endDate);

        const updated = await this.prisma.contract.update({
            where: { id: contractId },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
        await this.logActivity(user.orgId, projectId, 'contract.updated', updated.id, `Contract "${updated.title}" updated.`, {
            contractId: updated.id,
            status: updated.status,
            amount: updated.amount,
        });
        await this.notifyFinanceTeam(projectId, user.orgId, 'Contract updated', `Contract "${updated.title}" was updated.`, `/app/projects/${projectId}?tab=financials`);
        return updated;
    }

    async delete(projectId: string, contractId: string, user: UserWithRoles) {
        // Verify contract exists and belongs to project
        const contract = await this.prisma.contract.findFirst({
            where: {
                id: contractId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!contract) {
            throw new NotFoundException('Contract not found');
        }

        // Only SUPER_ADMIN/OPS/PM can delete contracts
        const adminRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!adminRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can delete contracts');
        }

        await this.logActivity(user.orgId, projectId, 'contract.deleted', contractId, `Contract "${contract.title}" deleted.`, {
            contractId,
            status: contract.status,
        });
        await this.notifyFinanceTeam(projectId, user.orgId, 'Contract deleted', `Contract "${contract.title}" was deleted.`, `/app/projects/${projectId}?tab=financials`);
        await this.prisma.contract.delete({
            where: { id: contractId }
        });
    }
}
