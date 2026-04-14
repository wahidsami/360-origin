import { Injectable, NotFoundException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { UserWithRoles } from '../common/utils/scope.utils';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { StorageService } from '../common/storage.service';
import { FileCategory, FileScopeType, FileVisibility, ContractStatus } from '@prisma/client';
import * as puppeteer from 'puppeteer';
import { existsSync } from 'fs';
import { SaudiAgreementPayload, buildSaudiAgreementHtml } from './agreement-renderer';

@Injectable()
export class ContractsService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private activity: ActivityService,
        private storage: StorageService,
        private config: ConfigService,
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

    private sanitizeFilename(filename: string) {
        return filename.replace(/[^\p{L}\p{N}._-]/gu, '_');
    }

    private compactDefinedFields<T extends Record<string, unknown>>(value: T): T {
        return Object.fromEntries(
            Object.entries(value).filter(([, entry]) => entry !== undefined),
        ) as T;
    }

    private normalizeAgreementLocale(locale?: string | null): 'ar' | 'en' {
        return String(locale || 'ar').toLowerCase().startsWith('en') ? 'en' : 'ar';
    }

    private normalizeAgreementPayload(payload?: Record<string, unknown> | null): SaudiAgreementPayload {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return {};
        }

        return this.compactDefinedFields({
            counterpartyName: typeof payload.counterpartyName === 'string' ? payload.counterpartyName : undefined,
            counterpartyRepresentative:
                typeof payload.counterpartyRepresentative === 'string' ? payload.counterpartyRepresentative : undefined,
            serviceDescription: typeof payload.serviceDescription === 'string' ? payload.serviceDescription : undefined,
            paymentTerms: typeof payload.paymentTerms === 'string' ? payload.paymentTerms : undefined,
            termDescription: typeof payload.termDescription === 'string' ? payload.termDescription : undefined,
            governingLaw: typeof payload.governingLaw === 'string' ? payload.governingLaw : undefined,
            jurisdiction: typeof payload.jurisdiction === 'string' ? payload.jurisdiction : undefined,
            includeConfidentiality: payload.includeConfidentiality === undefined ? undefined : Boolean(payload.includeConfidentiality),
            includeDataProtection: payload.includeDataProtection === undefined ? undefined : Boolean(payload.includeDataProtection),
            includeIntellectualProperty:
                payload.includeIntellectualProperty === undefined ? undefined : Boolean(payload.includeIntellectualProperty),
            includeTermination: payload.includeTermination === undefined ? undefined : Boolean(payload.includeTermination),
            includeForceMajeure: payload.includeForceMajeure === undefined ? undefined : Boolean(payload.includeForceMajeure),
            includeNotices: payload.includeNotices === undefined ? undefined : Boolean(payload.includeNotices),
            specialTerms: typeof payload.specialTerms === 'string' ? payload.specialTerms : undefined,
            isBilingual: payload.isBilingual === undefined ? undefined : Boolean(payload.isBilingual),
            signerName: typeof payload.signerName === 'string' ? payload.signerName : undefined,
            signerTitle: typeof payload.signerTitle === 'string' ? payload.signerTitle : undefined,
        });
    }

    private async launchPdfBrowser() {
        const executablePath =
            this.config.get<string>('PUPPETEER_EXECUTABLE_PATH') || process.env.PUPPETEER_EXECUTABLE_PATH;
        if (executablePath && !existsSync(executablePath)) {
            throw new ServiceUnavailableException(
                `Agreement export runtime is misconfigured. Browser executable was not found at "${executablePath}".`,
            );
        }

        return puppeteer.launch({
            headless: true,
            executablePath: executablePath || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }

    private async generateAgreementPdf(contract: any, project: any, org: any, user: UserWithRoles) {
        const locale = this.normalizeAgreementLocale(contract.agreementLocale);
        const payload = this.normalizeAgreementPayload(contract.agreementPayloadJson);
        const html = buildSaudiAgreementHtml({
            orgName: org?.name || 'Arena360',
            clientName: project?.client?.name || payload.counterpartyName || 'Client',
            projectName: project?.name || contract.title,
            contractTitle: contract.title,
            amount: Number(contract.amount || 0),
            currency: contract.currency || 'SAR',
            startDate: new Date(contract.startDate).toISOString(),
            endDate: contract.endDate ? new Date(contract.endDate).toISOString() : null,
            locale,
            payload,
        });

        const browser = await this.launchPdfBrowser();
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
            });

            const pdfFilename = `${this.sanitizeFilename(contract.title || 'agreement')}-${contract.id}.pdf`;
            const storageKey = this.storage.generateStorageKey(
                user.orgId,
                'PROJECT',
                project.id,
                'DOCS',
                pdfFilename,
            );
            await this.storage.putObject(storageKey, Buffer.from(pdfBuffer), 'application/pdf');

            const fileAsset = await this.prisma.fileAsset.create({
                data: {
                    orgId: user.orgId,
                    scopeType: FileScopeType.PROJECT,
                    projectId: project.id,
                    uploaderId: user.id,
                    category: FileCategory.DOCS,
                    visibility: contract.status === ContractStatus.ACTIVE ? FileVisibility.CLIENT : FileVisibility.INTERNAL,
                    filename: pdfFilename,
                    mimeType: 'application/pdf',
                    sizeBytes: pdfBuffer.length,
                    storageKey,
                },
            });

            return {
                agreementLocale: locale,
                agreementPayloadJson: payload,
                agreementPdfFileAssetId: fileAsset.id,
                agreementGeneratedAt: new Date(),
                agreementStatus: 'GENERATED',
            };
        } finally {
            await browser.close();
        }
    }

    private async enrichContract(contract: any) {
        if (!contract?.agreementPdfFileAsset?.storageKey) {
            return contract;
        }
        return {
            ...contract,
            agreementDownloadUrl: await this.storage.getSignedUrl(contract.agreementPdfFileAsset.storageKey, 3600, true),
        };
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
                agreementPdfFileAsset: true,
                invoices: {
                    select: { id: true, invoiceNumber: true, amount: true, status: true }
                }
            } as any,
            orderBy: { createdAt: 'desc' }
        } as any).then((contracts: any[]) => Promise.all(contracts.map((contract) => this.enrichContract(contract))));
    }

    async create(projectId: string, user: UserWithRoles, dto: CreateContractDto) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, orgId: user.orgId },
            include: {
                client: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Only PM/OPS/SUPER_ADMIN can create contracts
        const adminRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!adminRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can create contracts');
        }

        const contract: any = await this.prisma.contract.create({
            data: {
                ...dto,
                startDate: new Date(dto.startDate),
                endDate: dto.endDate ? new Date(dto.endDate) : null,
                projectId,
                createdById: user.id,
                orgId: user.orgId,
                agreementLocale: this.normalizeAgreementLocale(dto.agreementLocale),
                agreementPayloadJson: dto.agreementPayloadJson ?? undefined,
                agreementStatus: 'DRAFT',
            } as any,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                agreementPdfFileAsset: true,
            } as any
        } as any);
        const org = await this.prisma.org.findUnique({ where: { id: user.orgId } });
        if (!org) {
            throw new NotFoundException('Organization not found');
        }
        const generated = await this.generateAgreementPdf(contract, project, org, user);
        const updatedContract: any = await this.prisma.contract.update({
            where: { id: contract.id },
            data: generated as any,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                agreementPdfFileAsset: true,
                invoices: {
                    select: { id: true, invoiceNumber: true, amount: true, status: true }
                }
            } as any
        } as any);
        if (contract.agreementPdfFileAsset?.id && contract.agreementPdfFileAsset.id !== generated.agreementPdfFileAssetId) {
            await this.storage.deleteObject(contract.agreementPdfFileAsset.storageKey).catch(() => {});
            await this.prisma.fileAsset.delete({ where: { id: contract.agreementPdfFileAsset.id } }).catch(() => {});
        }
        await this.logActivity(user.orgId, projectId, 'contract.created', contract.id, `Contract "${contract.title}" created.`, {
            contractId: contract.id,
            amount: contract.amount,
            status: contract.status,
            agreementStatus: generated.agreementStatus,
        });
        await this.notifyFinanceTeam(projectId, user.orgId, 'Contract created', `Contract "${contract.title}" was created.`, `/app/projects/${projectId}?tab=financials`);
        return this.enrichContract(updatedContract);
    }

    async update(projectId: string, contractId: string, user: UserWithRoles, dto: UpdateContractDto) {
        // Verify contract exists and belongs to project
        const contract: any = await this.prisma.contract.findFirst({
            where: {
                id: contractId,
                projectId,
                orgId: user.orgId
            },
            include: {
                agreementPdfFileAsset: true,
            } as any
        } as any);

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
        if (dto.agreementLocale) updateData.agreementLocale = this.normalizeAgreementLocale(dto.agreementLocale);

        const updated: any = await this.prisma.contract.update({
            where: { id: contractId },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            } as any
        } as any);
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, orgId: user.orgId },
            include: {
                client: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!project) {
            throw new NotFoundException('Project not found');
        }
        const org = await this.prisma.org.findUnique({ where: { id: user.orgId } });
        if (!org) {
            throw new NotFoundException('Organization not found');
        }
        const generated = await this.generateAgreementPdf(updated, project, org, user);
        const refreshed: any = await this.prisma.contract.update({
            where: { id: contractId },
            data: generated as any,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                agreementPdfFileAsset: true,
                invoices: {
                    select: { id: true, invoiceNumber: true, amount: true, status: true }
                }
            } as any
        } as any);
        if (contract.agreementPdfFileAsset?.id && contract.agreementPdfFileAsset.id !== generated.agreementPdfFileAssetId) {
            await this.storage.deleteObject(contract.agreementPdfFileAsset.storageKey).catch(() => {});
            await this.prisma.fileAsset.delete({ where: { id: contract.agreementPdfFileAsset.id } }).catch(() => {});
        }
        await this.logActivity(user.orgId, projectId, 'contract.updated', updated.id, `Contract "${updated.title}" updated.`, {
            contractId: updated.id,
            status: updated.status,
            amount: updated.amount,
            agreementStatus: generated.agreementStatus,
        });
        await this.notifyFinanceTeam(projectId, user.orgId, 'Contract updated', `Contract "${updated.title}" was updated.`, `/app/projects/${projectId}?tab=financials`);
        return this.enrichContract(refreshed);
    }

    async delete(projectId: string, contractId: string, user: UserWithRoles) {
        // Verify contract exists and belongs to project
        const contract: any = await this.prisma.contract.findFirst({
            where: {
                id: contractId,
                projectId,
                orgId: user.orgId
            }
        } as any);

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
        if (contract.agreementPdfFileAsset?.storageKey) {
            await this.storage.deleteObject(contract.agreementPdfFileAsset.storageKey).catch(() => {});
            await this.prisma.fileAsset.delete({ where: { id: contract.agreementPdfFileAsset.id } }).catch(() => {});
        }
        await this.prisma.contract.delete({
            where: { id: contractId }
        });
    }
}
