import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ReportBuilderService } from './report-builder.service';

describe('ReportBuilderService', () => {
  const user = {
    id: 'user-1',
    orgId: 'org-1',
    role: 'PM',
    clientMemberships: [],
    projectMemberships: [],
  } as any;

  const prisma = {
    reportBuilderTemplate: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    projectReportEntry: {
      count: jest.fn(),
      create: jest.fn(),
    },
    projectReport: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    fileAsset: {
      findUnique: jest.fn(),
    },
  } as any;

  const storage = {
    objectExists: jest.fn(),
    getSignedUrl: jest.fn(),
  } as any;
  const config = {
    get: jest.fn(),
  } as any;
  const aiService = {
    generateProjectReportNarratives: jest.fn(),
  } as any;
  const activity = {
    create: jest.fn().mockResolvedValue(undefined),
  } as any;

  let service: ReportBuilderService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((_key: string) => undefined);
    service = new ReportBuilderService(prisma, storage, config, aiService, activity);
  });

  it('lists only published client-visible reports for client users', async () => {
    prisma.projectReport.findMany.mockResolvedValue([]);

    await service.listClientVisibleReports(user);

    expect(prisma.projectReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: 'org-1',
          visibility: 'CLIENT',
          status: 'PUBLISHED',
        }),
      }),
    );
  });

  it('rejects AI summary generation when the report has no entries', async () => {
    jest.spyOn(service as any, 'ensureProjectReportAccess').mockResolvedValue({ id: 'report-1', projectId: 'project-1' });
    prisma.projectReportEntry.count.mockResolvedValue(0);

    await expect(service.generateProjectReportAiSummary('report-1', user)).rejects.toBeInstanceOf(BadRequestException);
    expect(aiService.generateProjectReportNarratives).not.toHaveBeenCalled();
  });

  it('fails export with a deployment-safe error when the configured browser path is missing', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'PUPPETEER_EXECUTABLE_PATH') return 'Z:/missing/chrome.exe';
      return undefined;
    });
    jest.spyOn(service as any, 'buildProjectReportPreviewData').mockResolvedValue({
      report: { title: 'Demo', projectId: 'project-1', visibility: 'CLIENT' },
      entries: [],
    });
    jest.spyOn(service as any, 'renderProjectReportHtml').mockResolvedValue('<html></html>');

    await expect(service.exportProjectReportPdf('report-1', user)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates generic report templates without forcing accessibility defaults', async () => {
    prisma.reportBuilderTemplate.findFirst.mockResolvedValue(null);
    prisma.reportBuilderTemplate.create.mockResolvedValue({
      id: 'template-1',
      name: 'Security Review',
      code: 'security-review',
      description: null,
      category: 'SECURITY',
      status: 'DRAFT',
    });

    const template = await service.createTemplate('org-1', user, {
      name: 'Security Review',
      code: 'Security Review',
      description: 'General security report template',
      category: 'SECURITY',
    } as any);

    expect(prisma.reportBuilderTemplate.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org-1', code: 'security-review' },
      select: { id: true },
    });
    expect(prisma.reportBuilderTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          name: 'Security Review',
          code: 'security-review',
          description: 'General security report template',
          category: 'SECURITY',
          status: 'DRAFT',
          createdById: 'user-1',
        }),
      }),
    );
    expect(template.category).toBe('SECURITY');
  });

  it('allows generic report entries without accessibility taxonomy requirements', async () => {
    jest.spyOn(service as any, 'ensureProjectReportAccess').mockResolvedValue({
      id: 'report-1',
      orgId: 'org-1',
      projectId: 'project-1',
      title: 'Security Review',
      status: 'DRAFT',
      visibility: 'INTERNAL',
      template: { category: 'SECURITY' },
    });
    jest.spyOn(service as any, 'ensureDraftReportContent').mockImplementation(() => undefined);
    prisma.projectReportEntry.create.mockResolvedValue({
      id: 'entry-1',
      issueTitle: 'Weak CSP header',
      category: 'Security',
      subcategory: 'Headers',
    });

    const entry = await service.createProjectReportEntry('report-1', user, {
      serviceName: 'Web App',
      issueTitle: 'Weak CSP header',
      issueDescription: 'Content-Security-Policy is missing key directives.',
      category: 'Security',
      subcategory: 'Headers',
      rowDataJson: { auditOutcome: 'FAIL' },
    } as any);

    expect(prisma.projectReportEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          projectReportId: 'report-1',
          serviceName: 'Web App',
          issueTitle: 'Weak CSP header',
          issueDescription: 'Content-Security-Policy is missing key directives.',
          category: 'Security',
          subcategory: 'Headers',
        }),
      }),
    );
    expect(entry.issueTitle).toBe('Weak CSP header');
  });

  it('falls back to the brand logo when the stored client logo object is missing', async () => {
    prisma.fileAsset.findUnique.mockResolvedValue({
      storageKey: 'org/client/logo/missing.png',
    });
    storage.objectExists.mockResolvedValue(false);

    const logoUrl = await (service as any).resolveClientLogoUrl('logo-1');

    expect(storage.objectExists).toHaveBeenCalledWith('org/client/logo/missing.png');
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(logoUrl).toBe('/arenalogo.png');
  });
});
