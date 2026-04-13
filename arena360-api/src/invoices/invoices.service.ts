import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UserWithRoles } from '../common/utils/scope.utils';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { AutomationService } from '../automation/automation.service';
import { AutomationTriggerEntity, AutomationTriggerEvent } from '@prisma/client';
import { SlaService } from '../sla/sla.service';

@Injectable()
export class InvoicesService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
        private automation: AutomationService,
        private sla: SlaService,
    ) { }

    async findAll(projectId: string, user: UserWithRoles) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, orgId: user.orgId }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Clients cannot see all internal invoices, they're filtered below

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.invoice.findMany({
            where: {
                projectId,
                orgId: user.orgId,
                // Client users only see ISSUED or PAID invoices (not DRAFT/OVERDUE)
                ...(isClientUser && { status: { in: ['ISSUED', 'PAID'] } })
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                contract: {
                    select: { id: true, title: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async exportCsv(projectId: string, user: UserWithRoles): Promise<string> {
        const invoices = await this.findAll(projectId, user);
        const header = 'Invoice Number,Amount,Currency,Status,Due Date,Contract,Created By,Created\n';
        const escape = (v: unknown) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
        const rows = (invoices as any[]).map((i) =>
            [
                escape(i.invoiceNumber),
                escape(i.amount),
                escape(i.currency),
                escape(i.status),
                i.dueDate ? escape(new Date(i.dueDate).toISOString().slice(0, 10)) : '',
                escape(i.contract?.title),
                escape(i.createdBy?.name),
                i.createdAt ? escape(new Date(i.createdAt).toISOString()) : '',
            ].join(','),
        );
        return header + rows.join('\n');
    }

    async create(projectId: string, user: UserWithRoles, dto: CreateInvoiceDto) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, orgId: user.orgId }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // FINANCE, PM, OPS, SUPER_ADMIN can create invoices (DEV cannot)
        const allowedRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'FINANCE'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Only FINANCE, PM, OPS, or SUPER_ADMIN can create invoices');
        }

        // Verify contract if provided
        if (dto.contractId) {
            const contract = await this.prisma.contract.findFirst({
                where: {
                    id: dto.contractId,
                    projectId,
                    orgId: user.orgId
                }
            });

            if (!contract) {
                throw new NotFoundException('Contract not found');
            }
        }

        // Auto-set issuedAt when status is ISSUED
        const issuedAt = dto.status === 'ISSUED' ? new Date() : null;

        const invoice = await this.prisma.invoice.create({
            data: {
                ...dto,
                dueDate: new Date(dto.dueDate),
                issuedAt,
                projectId,
                createdById: user.id,
                orgId: user.orgId
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                contract: {
                    select: { id: true, title: true }
                }
            }
        });

        if (invoice.status === 'ISSUED' || invoice.status === 'OVERDUE') {
            this.sla.startOrUpdateTracker(invoice.orgId, 'INVOICE', invoice.id).catch(() => { });
        } else if (invoice.status === 'PAID') {
            this.sla.markMet(invoice.orgId, 'INVOICE', invoice.id).catch(() => { });
        }

        // Trigger automation
        this.automation.evaluateRules({
            orgId: user.orgId,
            entityType: AutomationTriggerEntity.INVOICE,
            entityId: invoice.id,
            event: AutomationTriggerEvent.CREATED,
            entity: { ...invoice, projectId }
        }).catch(() => { });

        return invoice;
    }

    async findOne(projectId: string, invoiceId: string, user: UserWithRoles) {
        const invoice = await this.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                projectId,
                orgId: user.orgId,
            },
            include: {
                createdBy: { select: { id: true, name: true, email: true } },
                contract: { select: { id: true, title: true } },
                project: { select: { id: true, name: true } },
            },
        });
        if (!invoice) throw new NotFoundException('Invoice not found');
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);
        if (isClientUser && !['ISSUED', 'PAID'].includes(invoice.status)) {
            throw new ForbiddenException('Access denied');
        }
        return invoice;
    }

    async createPaymentIntent(projectId: string, invoiceId: string, user: UserWithRoles): Promise<{ clientSecret: string }> {
        const invoice = await this.findOne(projectId, invoiceId, user);
        if (invoice.status !== 'ISSUED') {
            throw new BadRequestException('Only issued invoices can be paid');
        }
        const secret = this.config.get<string>('STRIPE_SECRET_KEY');
        if (!secret) throw new BadRequestException('Payments are not configured');
        const currency = (invoice.currency || 'SAR').toLowerCase();
        // Stripe: amount in smallest unit (cents for USD, halalas for SAR - 100 per unit)
        const amountMinor = Math.round(invoice.amount * 100);
        if (amountMinor < 1) throw new BadRequestException('Invoice amount must be at least 0.01');
        const stripe = new Stripe(secret);
        if (invoice.paymentIntentId) {
            const existing = await stripe.paymentIntents.retrieve(invoice.paymentIntentId).catch(() => null);
            if (existing && existing.status !== 'succeeded' && existing.status !== 'canceled') {
                return { clientSecret: existing.client_secret! };
            }
        }
        const pi = await stripe.paymentIntents.create({
            amount: amountMinor,
            currency,
            metadata: { invoiceId: invoice.id, orgId: invoice.orgId, projectId: invoice.projectId },
        });
        await this.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                paymentProvider: 'stripe',
                paymentIntentId: pi.id,
                paymentMetadata: pi as any,
            },
        });
        return { clientSecret: pi.client_secret! };
    }

    async update(projectId: string, invoiceId: string, user: UserWithRoles, dto: UpdateInvoiceDto) {
        // Verify invoice exists and belongs to project
        const invoice = await this.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!invoice) {
            throw new NotFoundException('Invoice not found');
        }

        // FINANCE, PM, OPS, SUPER_ADMIN can update invoices
        const allowedRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'FINANCE'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Only FINANCE, PM, OPS, or SUPER_ADMIN can update invoices');
        }

        const updateData: any = { ...dto };
        if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
        if (dto.issuedAt) updateData.issuedAt = new Date(dto.issuedAt);
        if (dto.paidAt) updateData.paidAt = new Date(dto.paidAt);

        // Auto-set issuedAt when status changes to ISSUED
        if (dto.status === 'ISSUED' && !invoice.issuedAt) {
            updateData.issuedAt = new Date();
        }

        // Auto-set paidAt when status changes to PAID
        if (dto.status === 'PAID' && !invoice.paidAt) {
            updateData.paidAt = new Date();
        }

        const updated = await this.prisma.invoice.update({
            where: { id: invoiceId },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                contract: {
                    select: { id: true, title: true }
                }
            }
        });

        const entity = { ...updated, projectId };

        // Trigger automation status changed
        if (dto.status && dto.status !== invoice.status) {
            this.automation.evaluateRules({
                orgId: user.orgId,
                entityType: AutomationTriggerEntity.INVOICE,
                entityId: invoiceId,
                event: AutomationTriggerEvent.STATUS_CHANGED,
                entity,
                previousEntity: { status: invoice.status }
            }).catch(() => { });
        }

        if (dto.status && dto.status !== invoice.status) {
            if (updated.status === 'ISSUED' || updated.status === 'OVERDUE') {
                this.sla.startOrUpdateTracker(user.orgId, 'INVOICE', invoiceId).catch(() => { });
            } else {
                this.sla.markMet(user.orgId, 'INVOICE', invoiceId).catch(() => { });
            }
        }

        // Trigger automation updated
        this.automation.evaluateRules({
            orgId: user.orgId,
            entityType: AutomationTriggerEntity.INVOICE,
            entityId: invoiceId,
            event: AutomationTriggerEvent.UPDATED,
            entity,
            previousEntity: { status: invoice.status }
        }).catch(() => { });

        return updated;
    }

    async delete(projectId: string, invoiceId: string, user: UserWithRoles) {
        // Verify invoice exists and belongs to project
        const invoice = await this.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!invoice) {
            throw new NotFoundException('Invoice not found');
        }

        // FINANCE, PM, OPS, SUPER_ADMIN can delete invoices
        const allowedRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'FINANCE'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Only FINANCE, PM, OPS, or SUPER_ADMIN can delete invoices');
        }

        this.sla.markMet(user.orgId, 'INVOICE', invoiceId).catch(() => { });
        await this.prisma.invoice.delete({
            where: { id: invoiceId }
        });
    }

    // Get financial stats for dashboard
    async getFinancialStats(orgId: string) {
        const invoices = await this.prisma.invoice.findMany({
            where: { orgId }
        });

        const totalOutstanding = invoices
            .filter(i => i.status === 'ISSUED' || i.status === 'OVERDUE')
            .reduce((sum, i) => sum + i.amount, 0);

        const totalOverdue = invoices
            .filter(i => i.status === 'OVERDUE')
            .reduce((sum, i) => sum + i.amount, 0);

        const totalPaid = invoices
            .filter(i => i.status === 'PAID')
            .reduce((sum, i) => sum + i.amount, 0);

        return {
            totalOutstanding,
            totalOverdue,
            totalPaid,
            invoiceCount: invoices.length
        };
    }

    /** Called by Stripe webhook when payment_intent.succeeded. */
    async markPaidByPaymentIntentId(paymentIntentId: string): Promise<void> {
        const invoice = await this.prisma.invoice.findFirst({
            where: { paymentIntentId, paymentProvider: 'stripe' },
        });
        if (!invoice) return;
        await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'PAID', paidAt: new Date() },
        });
        this.sla.markMet(invoice.orgId, 'INVOICE', invoice.id).catch(() => { });
    }
}
