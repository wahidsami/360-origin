import { ApprovalsService } from './approvals.service';

describe('ApprovalsService', () => {
  const prisma = {
    project: {
      findFirst: jest.fn(),
    },
    projectReport: {
      findFirst: jest.fn(),
    },
    report: {
      findFirst: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
    },
    contract: {
      findFirst: jest.fn(),
    },
    approvalRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const user = {
    id: 'user-1',
    orgId: 'org-1',
    role: 'SUPER_ADMIN',
    clientMemberships: [],
    projectMemberships: [],
  } as any;

  let service: ApprovalsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    service = new ApprovalsService(prisma);
  });

  it('resolves report approvals against project reports first', async () => {
    prisma.projectReport.findFirst.mockResolvedValue({
      orgId: 'org-1',
      projectId: 'project-1',
    });
    prisma.approvalRequest.findMany.mockResolvedValue([]);

    const result = await service.findByEntity('REPORT', 'report-1', user);

    expect(prisma.projectReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'report-1',
          orgId: 'org-1',
          deletedAt: null,
        }),
        select: { orgId: true, projectId: true },
      }),
    );
    expect(prisma.report.findFirst).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'REPORT', entityId: 'report-1', orgId: 'org-1' },
      }),
    );
    expect(result).toEqual([]);
  });

  it('falls back to the legacy report table when needed', async () => {
    prisma.projectReport.findFirst.mockResolvedValue(null);
    prisma.report.findFirst.mockResolvedValue({
      orgId: 'org-1',
      projectId: 'project-1',
    });
    prisma.approvalRequest.findMany.mockResolvedValue([]);

    await service.findByEntity('REPORT', 'legacy-report-1', user);

    expect(prisma.report.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'legacy-report-1',
          orgId: 'org-1',
          deletedAt: null,
        }),
        select: { orgId: true, projectId: true },
      }),
    );
  });
});
