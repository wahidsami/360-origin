import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { InvoicesController } from '../src/invoices/invoices.controller';
import { InvoicesService } from '../src/invoices/invoices.service';
import { ProjectReportsController } from '../src/report-builder/project-reports.controller';
import { ReportBuilderService } from '../src/report-builder/report-builder.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { RolesGuard as CommonRolesGuard } from '../src/common/guards/roles.guard';

describe('Portal and finance flows (e2e)', () => {
  let app: INestApplication<App>;

  let currentUser: any = {
    id: 'user-1',
    orgId: 'org-1',
    role: 'CLIENT_OWNER',
    customPermissions: ['VIEW_CLIENT_REPORTS'],
  };

  const dashboardServiceMock = {
    getAdminStats: jest.fn(),
    getDevStats: jest.fn(),
    getFinanceStats: jest.fn(),
    getClientStats: jest.fn(),
    getAnalytics: jest.fn(),
  };

  const invoicesServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    createPaymentIntent: jest.fn(),
    exportCsv: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getFinancialStats: jest.fn(),
  };

  const reportBuilderServiceMock = {
    listAvailableTemplates: jest.fn(),
    listClientVisibleReports: jest.fn(),
    listAccessibleProjectReports: jest.fn(),
    listProjectReports: jest.fn(),
    createProjectReport: jest.fn(),
    getProjectReport: jest.fn(),
    updateProjectReport: jest.fn(),
    listProjectReportEntries: jest.fn(),
    createProjectReportEntry: jest.fn(),
    reorderProjectReportEntries: jest.fn(),
    updateProjectReportEntry: jest.fn(),
    deleteProjectReportEntry: jest.fn(),
    uploadProjectReportEntryMedia: jest.fn(),
    deleteProjectReportEntryMedia: jest.fn(),
    getProjectReportPreview: jest.fn(),
    getLatestProjectReportExportDownload: jest.fn(),
    generateProjectReportAiSummary: jest.fn(),
    exportProjectReportPdf: jest.fn(),
  };

  const authGuardMock = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      req.user = currentUser;
      return true;
    },
  };

  const allowGuardMock = {
    canActivate: () => true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    currentUser = {
      id: 'user-1',
      orgId: 'org-1',
      role: 'CLIENT_OWNER',
      customPermissions: ['VIEW_CLIENT_REPORTS'],
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController, InvoicesController, ProjectReportsController],
      providers: [
        { provide: DashboardService, useValue: dashboardServiceMock },
        { provide: InvoicesService, useValue: invoicesServiceMock },
        { provide: ReportBuilderService, useValue: reportBuilderServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuardMock)
      .overrideGuard(PermissionsGuard)
      .useValue(allowGuardMock)
      .overrideGuard(CommonRolesGuard)
      .useValue(allowGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /dashboard/client returns the client portal summary', async () => {
    dashboardServiceMock.getClientStats.mockResolvedValue({
      activeProjects: 2,
      latestUpdatesCount: 4,
      pendingApprovals: 1,
      sharedFilesCount: 3,
      myProjects: [{ id: 'project-1', name: 'Client Portal', health: 'good', progress: 80 }],
      latestUpdates: [],
      files: [],
      nextMilestonesCount: 1,
    });

    await request(app.getHttpServer())
      .get('/dashboard/client')
      .expect(200)
      .expect(({ body }) => {
        expect(body.activeProjects).toBe(2);
        expect(body.latestUpdatesCount).toBe(4);
      });
  });

  it('GET /project-reports/client-visible exposes published client reports', async () => {
    reportBuilderServiceMock.listClientVisibleReports.mockResolvedValue([
      { id: 'report-1', title: 'Q1 Summary' },
    ]);

    await request(app.getHttpServer())
      .get('/project-reports/client-visible')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([{ id: 'report-1', title: 'Q1 Summary' }]);
      });
  });

  it('GET /dashboard/finance returns finance KPIs', async () => {
    currentUser.role = 'FINANCE';
    dashboardServiceMock.getFinanceStats.mockResolvedValue({
      outstandingAmount: 12500,
      invoicesDueCount: 2,
      paidThisMonth: 6400,
      contractsActive: 5,
      overdueInvoices: [],
      recentInvoices: [],
    });

    await request(app.getHttpServer())
      .get('/dashboard/finance')
      .expect(200)
      .expect(({ body }) => {
        expect(body.outstandingAmount).toBe(12500);
        expect(body.contractsActive).toBe(5);
      });
  });

  it('POST /projects/:projectId/invoices/:invoiceId/create-payment-intent creates a payment intent', async () => {
    currentUser.role = 'FINANCE';
    invoicesServiceMock.createPaymentIntent.mockResolvedValue({
      clientSecret: 'pi_secret_123',
    });

    await request(app.getHttpServer())
      .post('/projects/project-1/invoices/invoice-1/create-payment-intent')
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ clientSecret: 'pi_secret_123' });
      });
  });
});
