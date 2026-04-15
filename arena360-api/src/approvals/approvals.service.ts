import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { ReviewApprovalDto } from './dto/review-approval.dto';

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureProjectAccess(projectId: string, user: UserWithRoles) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...ScopeUtils.projectScope(user),
        deletedAt: null,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async ensureEntityExists(
    entityType: string,
    entityId: string,
    projectId: string | undefined,
    user: UserWithRoles,
  ): Promise<{ orgId: string; projectId: string | null }> {
    if (entityType === 'REPORT') {
      const projectReport = await this.prisma.projectReport.findFirst({
        where: {
          id: entityId,
          orgId: user.orgId,
          deletedAt: null,
          ...(projectId && { projectId }),
        },
        select: { orgId: true, projectId: true },
      });
      if (projectReport) {
        if (projectId && projectReport.projectId !== projectId) throw new BadRequestException('Report does not belong to project');
        await this.ensureProjectAccess(projectReport.projectId!, user);
        return { orgId: projectReport.orgId, projectId: projectReport.projectId };
      }

      const legacyReport = await this.prisma.report.findFirst({
        where: {
          id: entityId,
          orgId: user.orgId,
          deletedAt: null,
          ...(projectId && { projectId }),
        },
        select: { orgId: true, projectId: true },
      });
      if (!legacyReport) throw new NotFoundException('Report not found');
      if (projectId && legacyReport.projectId !== projectId) throw new BadRequestException('Report does not belong to project');
      await this.ensureProjectAccess(legacyReport.projectId!, user);
      return { orgId: legacyReport.orgId, projectId: legacyReport.projectId };
    }
    if (entityType === 'INVOICE') {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          id: entityId,
          orgId: user.orgId,
          ...(projectId && { projectId }),
        },
        select: { orgId: true, projectId: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (projectId && invoice.projectId !== projectId) throw new BadRequestException('Invoice does not belong to project');
      if (invoice.projectId) await this.ensureProjectAccess(invoice.projectId, user);
      return { orgId: invoice.orgId, projectId: invoice.projectId };
    }
    if (entityType === 'CONTRACT') {
      const contract = await this.prisma.contract.findFirst({
        where: {
          id: entityId,
          orgId: user.orgId,
          ...(projectId && { projectId }),
        },
        select: { orgId: true, projectId: true },
      });
      if (!contract) throw new NotFoundException('Contract not found');
      if (projectId && contract.projectId !== projectId) throw new BadRequestException('Contract does not belong to project');
      if (contract.projectId) await this.ensureProjectAccess(contract.projectId, user);
      return { orgId: contract.orgId, projectId: contract.projectId };
    }
    throw new BadRequestException('Invalid entityType');
  }

  async create(dto: CreateApprovalRequestDto, user: UserWithRoles) {
    const { orgId, projectId: entityProjectId } = await this.ensureEntityExists(
      dto.entityType,
      dto.entityId,
      dto.projectId ?? undefined,
      user,
    );
    const projectId = dto.projectId ?? entityProjectId ?? undefined;

    if (dto.steps && dto.steps.length > 0) {
      const existing = await this.prisma.approvalRequest.findFirst({
        where: {
          entityType: dto.entityType,
          entityId: dto.entityId,
          status: ApprovalStatus.PENDING,
        },
      });
      if (existing) throw new BadRequestException('An approval request is already pending for this item');

      const ids: string[] = [];
      for (let i = 0; i < dto.steps.length; i++) {
        const step = dto.steps[i];
        const created = await this.prisma.approvalRequest.create({
          data: {
            orgId,
            projectId: projectId ?? null,
            entityType: dto.entityType,
            entityId: dto.entityId,
            stepOrder: i + 1,
            approverId: step.approverId,
            requestedById: user.id,
          },
        });
        ids.push(created.id);
      }
      return this.prisma.approvalRequest.findMany({
        where: { id: { in: ids } },
        orderBy: { stepOrder: 'asc' },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      });
    }

    const existing = await this.prisma.approvalRequest.findFirst({
      where: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        status: ApprovalStatus.PENDING,
      },
    });
    if (existing) throw new BadRequestException('An approval request is already pending for this item');

    return this.prisma.approvalRequest.create({
      data: {
        orgId,
        projectId: projectId ?? null,
        entityType: dto.entityType,
        entityId: dto.entityId,
        stepOrder: 1,
        requestedById: user.id,
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findByEntity(
    entityType: 'REPORT' | 'INVOICE' | 'CONTRACT',
    entityId: string,
    user: UserWithRoles,
  ) {
    try {
      await this.ensureEntityExists(entityType, entityId, undefined, user);
    } catch (error) {
      if (error instanceof NotFoundException) return [];
      throw error;
    }
    const list = await this.prisma.approvalRequest.findMany({
      where: { entityType, entityId, orgId: user.orgId },
      orderBy: { stepOrder: 'asc' },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    });
    return list;
  }

  async getLatestForEntity(
    entityType: 'REPORT' | 'INVOICE' | 'CONTRACT',
    entityId: string,
    user: UserWithRoles,
  ) {
    try {
      await this.ensureEntityExists(entityType, entityId, undefined, user);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
    const latest = await this.prisma.approvalRequest.findFirst({
      where: { entityType, entityId, orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    return latest;
  }

  async listByProject(projectId: string, user: UserWithRoles) {
    await this.ensureProjectAccess(projectId, user);
    return this.prisma.approvalRequest.findMany({
      where: { projectId, orgId: user.orgId },
      orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }, { stepOrder: 'asc' }],
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    });
  }

  async listPending(user: UserWithRoles) {
    if (!ScopeUtils.isInternal(user)) throw new ForbiddenException('Only internal users can list pending approvals');
    return this.prisma.approvalRequest.findMany({
      where: { orgId: user.orgId, status: ApprovalStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        requestedBy: { select: { id: true, name: true } },
      },
    });
  }

  async approve(id: string, user: UserWithRoles, dto?: ReviewApprovalDto) {
    const req = await this.prisma.approvalRequest.findFirst({
      where: { id, orgId: user.orgId },
    });
    if (!req) throw new NotFoundException('Approval request not found');
    if (req.status !== ApprovalStatus.PENDING) throw new BadRequestException('Approval request is not pending');
    await this.ensureEntityExists(req.entityType, req.entityId, req.projectId ?? undefined, user);
    if (!ScopeUtils.isInternal(user)) throw new ForbiddenException('Only internal users can approve');
    if (req.approverId != null && req.approverId !== user.id) {
      throw new ForbiddenException('Only the designated approver for this step can approve');
    }
    const previousSteps = await this.prisma.approvalRequest.findMany({
      where: {
        entityType: req.entityType,
        entityId: req.entityId,
        stepOrder: { lt: req.stepOrder },
      },
    });
    const allPreviousApproved = previousSteps.every((s) => s.status === ApprovalStatus.APPROVED);
    if (!allPreviousApproved) {
      throw new BadRequestException('Previous approval steps must be approved first');
    }

    return this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalStatus.APPROVED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        comment: dto?.comment ?? undefined,
      },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    });
  }

  async reject(id: string, user: UserWithRoles, dto?: ReviewApprovalDto) {
    const req = await this.prisma.approvalRequest.findFirst({
      where: { id, orgId: user.orgId },
    });
    if (!req) throw new NotFoundException('Approval request not found');
    if (req.status !== ApprovalStatus.PENDING) throw new BadRequestException('Approval request is not pending');
    await this.ensureEntityExists(req.entityType, req.entityId, req.projectId ?? undefined, user);
    if (!ScopeUtils.isInternal(user)) throw new ForbiddenException('Only internal users can reject');
    if (req.approverId != null && req.approverId !== user.id) {
      throw new ForbiddenException('Only the designated approver for this step can reject');
    }
    const previousSteps = await this.prisma.approvalRequest.findMany({
      where: {
        entityType: req.entityType,
        entityId: req.entityId,
        stepOrder: { lt: req.stepOrder },
      },
    });
    const allPreviousApproved = previousSteps.every((s) => s.status === ApprovalStatus.APPROVED);
    if (!allPreviousApproved) {
      throw new BadRequestException('Previous approval steps must be approved first');
    }

    return this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        comment: dto?.comment ?? undefined,
      },
      include: {
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    });
  }
}
