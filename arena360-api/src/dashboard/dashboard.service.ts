import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    private readonly accessibilityTemplateCode = 'accessibility-audit';

    private normalizeAuditOutcome(value: unknown): 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_APPLICABLE' | 'NOT_TESTED' {
        if (value === 'PASS' || value === 'FAIL' || value === 'PARTIAL' || value === 'NOT_APPLICABLE' || value === 'NOT_TESTED') {
            return value;
        }
        return 'FAIL';
    }

    private getComplianceMetrics(entries: Array<{ rowDataJson?: unknown }>) {
        const counts = entries.reduce(
            (acc, entry) => {
                const outcome = this.normalizeAuditOutcome((entry?.rowDataJson as any)?.auditOutcome);
                acc[outcome] += 1;
                return acc;
            },
            {
                PASS: 0,
                FAIL: 0,
                PARTIAL: 0,
                NOT_APPLICABLE: 0,
                NOT_TESTED: 0,
            },
        );

        const scoredChecks = counts.PASS + counts.FAIL + counts.PARTIAL;
        const compliancePercentage = scoredChecks > 0
            ? Math.round(((counts.PASS + counts.PARTIAL * 0.5) / scoredChecks) * 100)
            : 0;

        return {
            scoredChecks,
            compliancePercentage,
            counts,
        };
    }

    async getAdminStats(user: UserWithRoles) {
        // Admin dashboard: internal role only
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Admin dashboard is for internal staff only');
        }

        // Aggregate stats within user's org
        const [activeClients, projects, tasks, pendingMilestones, paidInvoices, paidInvoicesByMonth, recentUpdates, pendingApprovals, accessibilityReports] = await Promise.all([
            this.prisma.client.findMany({
                where: { orgId: user.orgId, deletedAt: null, status: 'ACTIVE' },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
            this.prisma.project.findMany({
                where: { orgId: user.orgId, deletedAt: null, client: { deletedAt: null } },
                include: { client: { select: { name: true } } }
            }),
            this.prisma.task.findMany({
                where: {
                    deletedAt: null,
                    project: { orgId: user.orgId, deletedAt: null }
                },
                include: { project: { select: { name: true } } }
            }),
            this.prisma.milestone.count({
                where: {
                    deletedAt: null,
                    project: { orgId: user.orgId, deletedAt: null },
                    status: 'PENDING'
                }
            }),
            this.prisma.invoice.aggregate({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: 'PAID'
                },
                _sum: { amount: true }
            }),
            this.prisma.invoice.findMany({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: 'PAID',
                    paidAt: { not: null },
                },
                select: { amount: true, paidAt: true },
            }),
            this.prisma.projectUpdate.findMany({
                where: { orgId: user.orgId, deletedAt: null, project: { deletedAt: null } },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: { author: { select: { name: true } } }
            }),
            this.prisma.approvalRequest.count({
                where: {
                    orgId: user.orgId,
                    status: 'PENDING',
                },
            }),
            this.prisma.projectReport.findMany({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: {
                        deletedAt: null,
                    },
                    client: {
                        deletedAt: null,
                        status: 'ACTIVE',
                    },
                    template: {
                        code: this.accessibilityTemplateCode,
                        category: 'ACCESSIBILITY',
                    },
                },
                orderBy: [{ updatedAt: 'desc' }],
                select: {
                    id: true,
                    projectId: true,
                    title: true,
                    updatedAt: true,
                    clientId: true,
                    client: { select: { name: true } },
                    entries: {
                        where: { deletedAt: null },
                        select: { rowDataJson: true },
                    },
                },
            }),
        ]);

        const totalClients = activeClients.length;

        const activeProjects = projects.filter(p =>
            p.status === 'IN_PROGRESS' || p.status === 'PLANNING'
        ).length;

        const projectsAtRisk = projects
            .filter(p => p.health === 'AT_RISK' || p.health === 'CRITICAL')
            .map(p => ({
                id: p.id,
                name: p.name,
                health: p.health,
                progress: p.progress,
                clientName: p.client?.name || 'Unknown'
            }));

        const now = new Date();
        const overdueTasks = tasks.filter(t =>
            t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now
        ).length;

        const latestUpdates = recentUpdates.map(u => ({
            id: u.id,
            title: u.title,
            content: u.content,
            timestamp: u.createdAt,
            authorName: u.author?.name || 'Unknown'
        }));

        const revenueByMonth = this.buildRevenueByMonth(paidInvoicesByMonth, 7);
        const latestReportByClient = new Map<string, typeof accessibilityReports[number]>();

        for (const report of accessibilityReports) {
            if (!report.clientId || latestReportByClient.has(report.clientId)) continue;
            latestReportByClient.set(report.clientId, report);
        }

        const reportMetricsByClient = new Map(
            Array.from(latestReportByClient.values()).map((report) => {
                const metrics = this.getComplianceMetrics(report.entries);
                return [report.clientId, {
                    clientId: report.clientId,
                    clientName: report.client?.name || 'Unknown Client',
                    projectId: report.projectId,
                    reportId: report.id,
                    reportTitle: report.title,
                    latestReportAt: report.updatedAt,
                    compliancePercentage: metrics.compliancePercentage,
                    scoredChecks: metrics.scoredChecks,
                    needsAttentionChecks: metrics.counts.FAIL + metrics.counts.PARTIAL,
                    totalChecks: report.entries.length,
                    audited: report.entries.length > 0,
                }];
            }),
        );

        const clientComplianceComparison = activeClients
            .map((client) => {
                const reportMetrics = reportMetricsByClient.get(client.id);
                if (reportMetrics) {
                    return reportMetrics;
                }

                return {
                    clientId: client.id,
                    clientName: client.name,
                    projectId: null,
                    reportId: null,
                    reportTitle: null,
                    latestReportAt: null,
                    compliancePercentage: 0,
                    scoredChecks: 0,
                    needsAttentionChecks: 0,
                    totalChecks: 0,
                    audited: false,
                };
            })
            .sort((a, b) => {
                if (a.audited !== b.audited) {
                    return a.audited ? -1 : 1;
                }
                if (b.compliancePercentage !== a.compliancePercentage) {
                    return b.compliancePercentage - a.compliancePercentage;
                }
                return a.clientName.localeCompare(b.clientName);
            });

        const auditedClients = clientComplianceComparison.filter((item) => item.audited).length;
        const averageCompliance = auditedClients > 0
            ? Math.round(
                clientComplianceComparison
                    .filter((item) => item.audited)
                    .reduce((sum, item) => sum + item.compliancePercentage, 0) / auditedClients,
            )
            : 0;
        const needsAttentionChecks = clientComplianceComparison
            .filter((item) => item.audited)
            .reduce((sum, item) => sum + item.needsAttentionChecks, 0);
        const scoredChecks = clientComplianceComparison
            .filter((item) => item.audited)
            .reduce((sum, item) => sum + item.scoredChecks, 0);

        return {
            totalClients,
            activeProjects,
            projectsAtRisk: projectsAtRisk.slice(0, 5), // Top 5
            overdueTasks,
            latestUpdates,
            recentUpdatesCount: latestUpdates.length,
            pendingMilestones,
            pendingApprovals,
            revenue: paidInvoices._sum.amount || 0,
            revenueByMonth,
            auditedClients,
            averageCompliance,
            needsAttentionChecks,
            scoredChecks,
            clientComplianceComparison,
        };
    }

    async getDevStats(user: UserWithRoles) {
        const allowedRoles = ['DEV', 'QA'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Developer dashboard is for DEV/QA users only');
        }

        // Dev dashboard: tasks assigned to this developer
        const tasks = await this.prisma.task.findMany({
            where: {
                assigneeId: user.id,
                status: { not: 'DONE' },
                deletedAt: null,
                project: {
                    ...ScopeUtils.projectScope(user),
                    deletedAt: null,
                },
            },
            include: { project: { select: { name: true } } },
            orderBy: { dueDate: 'asc' }
        });

        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const myOpenTasks = tasks.length;
        const dueSoon = tasks.filter(t =>
            t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= nextWeek
        ).length;
        const inReview = tasks.filter(t => t.status === 'REVIEW').length;
        const overdue = tasks.filter(t =>
            t.dueDate && new Date(t.dueDate) < now
        ).length;

        const assignedTasks = tasks.slice(0, 10).map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            projectId: t.projectId,
            projectName: t.project?.name || 'Unknown'
        }));

        return {
            myOpenTasks,
            dueSoon,
            inReview,
            overdue,
            assignedTasks
        };
    }

    async getFinanceStats(user: UserWithRoles) {
        // Finance dashboard: internal finance role
        const financeRoles = ['SUPER_ADMIN', 'OPS', 'FINANCE'];
        if (!financeRoles.includes(user.role)) {
            throw new ForbiddenException('Finance dashboard is for finance staff only');
        }

        const [
            outstandingStats,
            invoicesDueCount,
            paidStats,
            contractsActive,
            overdueInvoices,
            recentInvoices
        ] = await Promise.all([
            // 1. Outstanding Amount (ISSUED or OVERDUE)
            this.prisma.invoice.aggregate({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: { in: ['ISSUED', 'OVERDUE'] }
                },
                _sum: { amount: true }
            }),
            // 2. Invoices Due Count
            this.prisma.invoice.count({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: { in: ['ISSUED', 'OVERDUE'] }
                }
            }),
            // 3. Paid This Month
            this.prisma.invoice.aggregate({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: 'PAID',
                    paidAt: {
                        not: null,
                        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                    }
                },
                _sum: { amount: true }
            }),
            // 4. Active Contracts
            this.prisma.contract.count({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: 'ACTIVE'
                }
            }),
            // 5. Overdue Invoices List
            this.prisma.invoice.findMany({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    project: { deletedAt: null },
                    status: { not: 'PAID' },
                    dueDate: { lt: new Date() }
                },
                take: 5,
                orderBy: { dueDate: 'asc' },
                include: { project: { select: { client: { select: { name: true } } } } }
            }),
            // 6. Recent Invoices List
            this.prisma.invoice.findMany({
                where: { orgId: user.orgId, deletedAt: null, project: { deletedAt: null } },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { project: { select: { client: { select: { name: true } } } } }
            })
        ]);

        return {
            outstandingAmount: outstandingStats._sum.amount || 0,
            invoicesDueCount,
            paidThisMonth: paidStats._sum.amount || 0,
            contractsActive,
            overdueInvoices: overdueInvoices.map(inv => ({
                id: inv.id,
                reference: inv.invoiceNumber,
                amount: inv.amount,
                currency: inv.currency,
                dueDate: inv.dueDate,
                issuedDate: inv.issuedAt || inv.createdAt,
                clientName: inv.project?.client?.name || 'Unknown',
                status: this.mapInvoiceStatus(inv.status),
            })),
            recentInvoices: recentInvoices.map(inv => ({
                id: inv.id,
                reference: inv.invoiceNumber,
                amount: inv.amount,
                currency: inv.currency,
                dueDate: inv.dueDate,
                issuedDate: inv.issuedAt || inv.createdAt,
                status: this.mapInvoiceStatus(inv.status),
                clientName: inv.project?.client?.name || 'Unknown'
            }))
        };
    }

    async getClientStats(user: UserWithRoles) {
        // Client dashboard: show projects for client user's organization
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER', 'VIEWER'];
        if (!clientRoles.includes(user.role)) {
            throw new ForbiddenException('Client dashboard is for client users only');
        }

        // Access can come from direct client membership OR project membership.
        // Some client users are assigned only to projects.
        const clientIdsSet = new Set<string>(
            (user.clientMemberships || []).map((membership) => membership.clientId),
        );
        const projectIdsSet = new Set<string>(
            (user.projectMemberships || []).map((membership) => membership.projectId),
        );
        for (const membership of user.projectMemberships || []) {
            const clientId = membership.project?.clientId;
            if (clientId) clientIdsSet.add(clientId);
        }

        const clientIds = Array.from(clientIdsSet);
        const assignedProjectIds = Array.from(projectIdsSet);

        if (clientIds.length === 0 && assignedProjectIds.length === 0) {
            return {
                activeProjects: 0,
                nextMilestonesCount: 0,
                latestUpdatesCount: 0,
                pendingApprovals: 0,
                sharedFilesCount: 0,
                files: [],
                myProjects: []
            };
        }

        const projectAccessFilters: any[] = [];
        if (clientIds.length > 0) {
            projectAccessFilters.push({ clientId: { in: clientIds } });
        }
        if (assignedProjectIds.length > 0) {
            projectAccessFilters.push({ id: { in: assignedProjectIds } });
        }

        const projects = await this.prisma.project.findMany({
            where: {
                orgId: user.orgId,
                deletedAt: null,
                OR: projectAccessFilters,
            },
            orderBy: { updatedAt: 'desc' }
        });

        const projectIds = projects.map((project) => project.id);
        const accessibleClientIds = Array.from(new Set(projects.map((project) => project.clientId)));

        if (projectIds.length === 0) {
            return {
                activeProjects: 0,
                nextMilestonesCount: 0,
                latestUpdatesCount: 0,
                pendingApprovals: 0,
                sharedFilesCount: 0,
                files: [],
                myProjects: []
            };
        }

        const [upcomingMilestonesCount, sharedFilesCount, files, pendingApprovals, latestUpdatesCount, latestUpdates] = await Promise.all([
            this.prisma.milestone.count({
                where: {
                    projectId: { in: projectIds },
                    status: { in: ['PENDING', 'IN_PROGRESS'] },
                    dueDate: { gte: new Date() },
                },
            }),
            this.prisma.fileAsset.count({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    visibility: 'CLIENT',
                    OR: [
                        { clientId: { in: accessibleClientIds } },
                        { projectId: { in: projectIds } },
                    ],
                },
            }),
            this.prisma.fileAsset.findMany({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    visibility: 'CLIENT',
                    OR: [
                        { clientId: { in: accessibleClientIds } },
                        { projectId: { in: projectIds } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 6,
            }),
            this.prisma.approvalRequest.count({
                where: {
                    orgId: user.orgId,
                    status: 'PENDING',
                    projectId: {
                        in: projectIds,
                    },
                },
            }),
            this.prisma.projectUpdate.count({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    visibility: 'CLIENT',
                    projectId: { in: projectIds },
                    project: { deletedAt: null },
                },
            }),
            this.prisma.projectUpdate.findMany({
                where: {
                    orgId: user.orgId,
                    deletedAt: null,
                    visibility: 'CLIENT',
                    projectId: { in: projectIds },
                    project: { deletedAt: null },
                },
                orderBy: { createdAt: 'desc' },
                take: 6,
                select: {
                    id: true,
                    title: true,
                    content: true,
                    createdAt: true,
                    projectId: true,
                    project: { select: { id: true, name: true } },
                    author: { select: { name: true } },
                },
            }),
        ]);

        const activeProjects = projects.filter(p =>
            p.status !== 'ARCHIVED' && p.status !== 'COMPLETED'
        ).length;

        const myProjects = projects.map(p => ({
            id: p.id,
            name: p.name,
            deadline: p.endDate,
            progress: p.progress,
            health: p.health,
            status: p.status
        }));

        return {
            activeProjects,
            nextMilestonesCount: upcomingMilestonesCount,
            latestUpdatesCount,
            latestUpdates: latestUpdates.map((update) => ({
                id: update.id,
                title: update.title,
                content: update.content,
                timestamp: update.createdAt.toISOString(),
                projectId: update.projectId,
                projectName: update.project.name,
                authorName: update.author.name,
            })),
            pendingApprovals,
            sharedFilesCount,
            files,
            myProjects
        };
    }

    private buildRevenueByMonth(
        invoices: Array<{ amount: number; paidAt: Date | null }>,
        monthsBack: number,
    ) {
        const buckets = new Map<string, number>();

        for (let i = monthsBack - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(1);
            date.setMonth(date.getMonth() - i);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            buckets.set(monthKey, 0);
        }

        for (const invoice of invoices) {
            if (!invoice.paidAt) continue;
            const monthKey = `${invoice.paidAt.getFullYear()}-${String(invoice.paidAt.getMonth() + 1).padStart(2, '0')}`;
            if (buckets.has(monthKey)) {
                buckets.set(monthKey, (buckets.get(monthKey) || 0) + invoice.amount);
            }
        }

        return Array.from(buckets.entries()).map(([monthKey, amount]) => ({
            monthKey,
            amount,
        }));
    }

    private mapInvoiceStatus(status: string) {
        switch (status) {
            case 'PAID':
                return 'paid';
            case 'ISSUED':
                return 'sent';
            case 'OVERDUE':
                return 'overdue';
            default:
                return 'draft';
        }
    }

    /** Advanced analytics for Analytics page (internal roles) */
    async getAnalytics(user: UserWithRoles) {
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'FINANCE', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Analytics is for internal staff only');
        }
        const orgId = user.orgId;

        const [
            projectsByHealth,
            projectsByStatus,
            projectsWithBudget,
            tasksByAssignee,
            tasksDoneLast30Days,
            invoicesPaidByMonth,
            invoicesOutstandingByAge,
            findingsBySeverity,
            findingsByStatus,
            findingsClosedWithTime,
            allTasksCount,
            doneTasksCount,
            tasksDoneByWeekRaw,
        ] = await Promise.all([
            this.prisma.project.groupBy({
                by: ['health'],
                where: { orgId, deletedAt: null },
                _count: { id: true },
            }),
            this.prisma.project.groupBy({
                by: ['status'],
                where: { orgId, deletedAt: null },
                _count: { id: true },
            }),
            this.prisma.project.aggregate({
                where: { orgId, deletedAt: null },
                _sum: { budget: true },
                _count: { id: true },
            }),
            this.prisma.task.groupBy({
                by: ['assigneeId'],
                where: { project: { orgId }, deletedAt: null, status: { not: 'DONE' } },
                _count: { id: true },
            }),
            this.prisma.task.count({
                where: {
                    project: { orgId },
                    status: 'DONE',
                    updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                },
            }),
            this.prisma.invoice.findMany({
                where: { orgId, status: 'PAID' },
                select: { paidAt: true, amount: true },
            }),
            this.prisma.invoice.findMany({
                where: { orgId, status: { in: ['ISSUED', 'OVERDUE'] } },
                select: { amount: true, dueDate: true },
            }),
            this.prisma.finding.groupBy({
                by: ['severity'],
                where: { orgId, deletedAt: null },
                _count: { id: true },
            }),
            this.prisma.finding.groupBy({
                by: ['status'],
                where: { orgId, deletedAt: null },
                _count: { id: true },
            }),
            this.prisma.finding.findMany({
                where: { orgId, status: 'CLOSED', deletedAt: null },
                select: { createdAt: true, updatedAt: true },
            }),
            this.prisma.task.count({
                where: { project: { orgId }, deletedAt: null },
            }),
            this.prisma.task.count({
                where: { project: { orgId }, status: 'DONE', deletedAt: null },
            }),
            this.prisma.task.findMany({
                where: {
                    project: { orgId },
                    status: 'DONE',
                    deletedAt: null,
                    updatedAt: { gte: new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000) },
                },
                select: { updatedAt: true },
            }),
        ]);

        // Paid by month (last 12 months)
        const paidByMonth: Record<string, number> = {};
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            paidByMonth[key] = 0;
        }
        for (const inv of invoicesPaidByMonth) {
            if (!inv.paidAt) continue;
            const key = `${inv.paidAt.getFullYear()}-${String(inv.paidAt.getMonth() + 1).padStart(2, '0')}`;
            if (key in paidByMonth) paidByMonth[key] += inv.amount;
        }

        // AR aging: 0-30, 31-60, 61-90, 90+
        const now = new Date();
        const arAging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
        for (const inv of invoicesOutstandingByAge) {
            const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000));
            if (days <= 30) arAging['0-30'] += inv.amount;
            else if (days <= 60) arAging['31-60'] += inv.amount;
            else if (days <= 90) arAging['61-90'] += inv.amount;
            else arAging['90+'] += inv.amount;
        }

        // MTTR: mean time to close (days)
        let mttrDays: number | null = null;
        if (findingsClosedWithTime.length > 0) {
            const totalDays = findingsClosedWithTime.reduce(
                (sum, f) => sum + (new Date(f.updatedAt).getTime() - new Date(f.createdAt).getTime()) / (24 * 60 * 60 * 1000),
                0,
            );
            mttrDays = Math.round((totalDays / findingsClosedWithTime.length) * 10) / 10;
        }

        // Resolve assignee names
        const assigneeIds = [...new Set(tasksByAssignee.map((t) => t.assigneeId).filter(Boolean))] as string[];
        const users = assigneeIds.length
            ? await this.prisma.user.findMany({
                where: { id: { in: assigneeIds } },
                select: { id: true, name: true },
            })
            : [];
        const userMap = new Map(users.map((u) => [u.id, u.name]));

        // Velocity: tasks completed per week (last 8 weeks, week starts Monday)
        const velocityByWeek: { weekLabel: string; completed: number }[] = [];
        for (let i = 7; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i * 7);
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            const weekEnd = new Date(d);
            weekEnd.setDate(weekEnd.getDate() + 7);
            const weekLabel = d.toISOString().slice(0, 10);
            const completed = (tasksDoneByWeekRaw || []).filter(
                (t) => new Date(t.updatedAt) >= d && new Date(t.updatedAt) < weekEnd,
            ).length;
            velocityByWeek.push({ weekLabel, completed });
        }

        const completionRate =
            allTasksCount > 0 ? Math.round((doneTasksCount / allTasksCount) * 1000) / 10 : 0;

        return {
            portfolio: {
                byHealth: projectsByHealth.map((g) => ({ health: g.health, count: g._count.id })),
                byStatus: projectsByStatus.map((g) => ({ status: g.status, count: g._count.id })),
                totalBudget: projectsWithBudget._sum.budget || 0,
                projectCount: projectsWithBudget._count.id,
            },
            team: {
                byAssignee: tasksByAssignee.map((g) => ({
                    assigneeId: g.assigneeId,
                    assigneeName: g.assigneeId ? userMap.get(g.assigneeId) || 'Unassigned' : 'Unassigned',
                    openTasks: g._count.id,
                })),
                tasksDoneLast30Days,
                velocityByWeek,
                completionRate,
                totalTasks: allTasksCount,
                doneTasks: doneTasksCount,
            },
            financial: {
                revenueByMonth: Object.entries(paidByMonth).map(([month, amount]) => ({ month, amount })),
                arAging,
                totalOutstanding: invoicesOutstandingByAge.reduce((s, i) => s + i.amount, 0),
            },
            findings: {
                bySeverity: findingsBySeverity.map((g) => ({ severity: g.severity, count: g._count.id })),
                byStatus: findingsByStatus.map((g) => ({ status: g.status, count: g._count.id })),
                mttrDays,
                totalClosed: findingsClosedWithTime.length,
            },
        };
    }
}

