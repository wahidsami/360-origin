import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { StorageService } from '../common/storage.service';
import { GlobalRole } from '@prisma/client';

@Injectable()
export class ClientsService {
    private readonly defaultAccessibilityTemplateCode = 'accessibility-audit';

    constructor(
        private prisma: PrismaService,
        private storage: StorageService
    ) { }

    private async resolveLogoUrl(logoId: string | null | undefined): Promise<string | undefined> {
        if (!logoId) return '/arenalogo.png';
        // If it looks like a URL already, return it
        if (logoId.startsWith('http')) return logoId;

        try {
            const file = await this.prisma.fileAsset.findUnique({
                where: { id: logoId }
            });
            if (file) {
                return this.storage.getSignedUrl(file.storageKey, 3600);
            }
        } catch (e) {
            console.error('Failed to resolve logo URL:', e);
        }
        return '/arenalogo.png';
    }

    async create(user: UserWithRoles, createClientDto: any) {
        // Enforce: Only internal roles can create clients
        const internalRoles: GlobalRole[] = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            // For now, allow it but ideally throw ForbiddenException
            // throw new ForbiddenException('Only internal staff can create clients');
        }

        // Normalize status
        const status = createClientDto.status ? createClientDto.status.toUpperCase().replace(/-/g, '_') : undefined;

        return this.prisma.$transaction(async (tx) => {
            const client = await tx.client.create({
                data: {
                    name: createClientDto.name,
                    industry: createClientDto.industry,
                    contactPerson: createClientDto.contactPerson,
                    email: createClientDto.email,
                    phone: createClientDto.phone,
                    website: createClientDto.website,
                    address: createClientDto.address,
                    notes: createClientDto.notes,
                    status: status as any,
                    billing: createClientDto.billing || undefined,
                    org: { connect: { id: user.orgId } },
                    lastActivity: new Date(),
                },
            });

            const template = await tx.reportBuilderTemplate.findFirst({
                where: {
                    orgId: user.orgId,
                    category: 'ACCESSIBILITY',
                    code: this.defaultAccessibilityTemplateCode,
                    status: 'ACTIVE',
                },
                include: {
                    versions: {
                        where: { isPublished: true },
                        orderBy: [{ versionNumber: 'desc' }],
                        take: 1,
                    },
                },
            }) ?? await tx.reportBuilderTemplate.findFirst({
                where: {
                    orgId: user.orgId,
                    category: 'ACCESSIBILITY',
                    status: 'ACTIVE',
                },
                include: {
                    versions: {
                        where: { isPublished: true },
                        orderBy: [{ versionNumber: 'desc' }],
                        take: 1,
                    },
                },
                orderBy: [{ updatedAt: 'desc' }],
            });

            const publishedVersion = template?.versions?.[0];
            if (template && publishedVersion) {
                await tx.clientReportTemplateAssignment.create({
                    data: {
                        orgId: user.orgId,
                        clientId: client.id,
                        templateId: template.id,
                        templateVersionId: publishedVersion.id,
                        isDefault: true,
                        isActive: true,
                        assignedById: user.id,
                    },
                });
            }

            return client;
        });
    }

    async findAll(user: UserWithRoles, query: any = {}) {
        const where: any = {
            ...ScopeUtils.clientScope(user, 'id'),
            deletedAt: null
        };
        
        if (query.includeArchived !== 'true') {
            where.status = { not: 'ARCHIVED' };
        }

        const clients = await this.prisma.client.findMany({
            where,
            include: {
                projects: {
                    select: { id: true, status: true, health: true }
                },
                members: true
            },
            orderBy: { updatedAt: 'desc' }
        });

        // Transform for frontend if needed (e.g. activeProjects count)
        return Promise.all(clients.map(async (c: any) => ({
            ...c,
            activeProjects: c.projects.filter((p: any) => p.status === 'ACTIVE').length,
            logoUrl: await this.resolveLogoUrl(c.logo)
        })));
    }

    async findOne(id: string, user: UserWithRoles) {
        const clientScope = ScopeUtils.clientScope(user, 'id');
        const client = await this.prisma.client.findFirst({
            where: {
                orgId: user.orgId,
                deletedAt: null,
                AND: [
                    { id },
                    clientScope.id ? { id: clientScope.id } : {},
                ],
            },
            include: {
                projects: true,
                members: {
                    include: { user: true }
                }
            },
        });
        if (!client) throw new NotFoundException('Client not found');
        return {
            ...(client as any),
            logoUrl: await this.resolveLogoUrl((client as any).logo)
        };
    }

    async update(id: string, user: UserWithRoles, updateClientDto: any) {
        // Verify existence and scope first
        await this.findOne(id, user);

        // Normalize status
        const data: any = { ...updateClientDto };
        if (data.status) data.status = data.status.toUpperCase().replace(/-/g, '_');

        return this.prisma.client.update({
            where: { id },
            data: {
                name: data.name,
                industry: data.industry,
                contactPerson: data.contactPerson,
                email: data.email,
                phone: data.phone,
                website: data.website,
                address: data.address,
                notes: data.notes,
                status: data.status,
                billing: data.billing,
                logo: data.logo,
                updatedAt: new Date()
            }
        });
    }

    async getFinancialSummary(id: string, user: UserWithRoles) {
        await this.findOne(id, user);

        const projects = await this.prisma.project.findMany({
            where: {
                orgId: user.orgId,
                clientId: id,
                deletedAt: null,
            },
            select: { id: true },
        });

        const projectIds = projects.map((project) => project.id);
        if (projectIds.length === 0) {
            return {
                openInvoices: 0,
                overdueAmount: 0,
                totalPaid: 0,
                activeContracts: 0,
                nextContractEndDate: null,
            };
        }

        const [invoices, contracts] = await Promise.all([
            this.prisma.invoice.findMany({
                where: {
                    orgId: user.orgId,
                    projectId: { in: projectIds },
                    deletedAt: null,
                },
                select: {
                    amount: true,
                    status: true,
                },
            }),
            this.prisma.contract.findMany({
                where: {
                    orgId: user.orgId,
                    projectId: { in: projectIds },
                    deletedAt: null,
                },
                select: {
                    endDate: true,
                    status: true,
                },
            }),
        ]);

        const activeContracts = contracts.filter((contract) => contract.status === 'ACTIVE');
        const nextContractEndDate = activeContracts
            .map((contract) => contract.endDate)
            .filter((endDate): endDate is Date => !!endDate)
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

        return {
            openInvoices: invoices.filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'OVERDUE').length,
            overdueAmount: invoices
                .filter((invoice) => invoice.status === 'OVERDUE')
                .reduce((sum, invoice) => sum + invoice.amount, 0),
            totalPaid: invoices
                .filter((invoice) => invoice.status === 'PAID')
                .reduce((sum, invoice) => sum + invoice.amount, 0),
            activeContracts: activeContracts.length,
            nextContractEndDate,
        };
    }

    async getActivity(id: string, user: UserWithRoles) {
        await this.findOne(id, user);

        const projects = await this.prisma.project.findMany({
            where: {
                orgId: user.orgId,
                clientId: id,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
            },
        });

        const projectIds = projects.map((project) => project.id);
        if (projectIds.length === 0) {
            return [];
        }

        const projectMap = new Map(projects.map((project) => [project.id, project.name]));

        const feeds = await this.prisma.activityFeed.findMany({
            where: {
                orgId: user.orgId,
                projectId: { in: projectIds },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });

        const userIds = [...new Set(feeds.map((feed) => feed.userId))];
        const users = userIds.length
            ? await this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true },
            })
            : [];

        const userMap = new Map(users.map((entry) => [entry.id, entry.name]));

        return feeds.map((feed) => ({
            id: feed.id,
            entityId: feed.entityId ?? feed.id,
            action: feed.action,
            description: feed.projectId && projectMap.has(feed.projectId)
                ? `${feed.description} (${projectMap.get(feed.projectId)})`
                : feed.description,
            userId: feed.userId,
            userName: userMap.get(feed.userId) ?? 'Unknown',
            timestamp: feed.createdAt.toISOString(),
            type: feed.entityType as 'file' | 'update' | 'comment' | 'system',
        }));
    }

    async archive(id: string, user: UserWithRoles) {
        await this.findOne(id, user);
        return this.prisma.client.update({
            where: { id },
            data: { status: 'ARCHIVED' }
        });
    }

    async restore(id: string, user: UserWithRoles) {
        await this.findOne(id, user);
        return this.prisma.client.update({
            where: { id },
            data: { status: 'ACTIVE' }
        });
    }

    // --- Membership ---
    async getMembers(clientId: string) {
        return this.prisma.clientMember.findMany({
            where: { clientId },
            include: { user: { select: { id: true, name: true, email: true, role: true } } }
        });
    }

    async addMember(clientId: string, userId: string, role: any) {
        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        // Check if already exists
        const existing = await this.prisma.clientMember.findFirst({
            where: { clientId, userId }
        });

        if (existing) {
            return this.prisma.clientMember.update({
                where: { id: existing.id },
                data: { role }
            });
        }

        return this.prisma.clientMember.create({
            data: {
                clientId,
                userId,
                role
            }
        });
    }

    async updateMemberRole(clientId: string, userId: string, role: any) {
        // Find exact record
        const member = await this.prisma.clientMember.findFirst({
            where: { clientId, userId }
        });

        if (!member) throw new NotFoundException('Member not found in client');

        return this.prisma.clientMember.update({
            where: { id: member.id },
            data: { role }
        });
    }

    async remove(id: string, user: UserWithRoles) {
        await this.findOne(id, user); // Verify existence/access
        return this.prisma.client.update({
            where: { id },
            data: { deletedAt: new Date() }
        });
    }

    async removeMember(clientId: string, userId: string) {
        const member = await this.prisma.clientMember.findFirst({
            where: { clientId, userId }
        });

        if (member) {
            await this.prisma.clientMember.delete({ where: { id: member.id } });
        }
        return { success: true };
    }
}

