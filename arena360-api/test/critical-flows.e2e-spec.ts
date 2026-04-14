import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { IntegrationsController } from '../src/integrations/integrations.controller';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { ApprovalsController } from '../src/approvals/approvals.controller';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ProjectReportsController } from '../src/report-builder/project-reports.controller';
import { ReportBuilderService } from '../src/report-builder/report-builder.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { RolesGuard as CommonRolesGuard } from '../src/common/guards/roles.guard';

describe('Critical flows (e2e)', () => {
  let app: INestApplication<App>;

  const user = {
    id: 'user-1',
    orgId: 'org-1',
    role: 'SUPER_ADMIN',
    customPermissions: ['VIEW_CLIENT_REPORTS', 'GENERATE_PROJECT_REPORT_EXPORTS'],
  };

  const notificationsServiceMock = {
    findAllForUser: jest.fn(),
    getUnreadCount: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const integrationsServiceMock = {
    listIntegrations: jest.fn(),
    createIntegration: jest.fn(),
    listWebhooks: jest.fn(),
    createWebhook: jest.fn(),
    updateWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
    updateIntegration: jest.fn(),
    deleteIntegration: jest.fn(),
    testSlack: jest.fn(),
    createGitHubIssue: jest.fn(),
  };

  const approvalsServiceMock = {
    create: jest.fn(),
    findByEntity: jest.fn(),
    getLatestForEntity: jest.fn(),
    listByProject: jest.fn(),
    listPending: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
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
      req.user = user;
      return true;
    },
  };

  const allowGuardMock = {
    canActivate: () => true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        NotificationsController,
        IntegrationsController,
        ApprovalsController,
        ProjectReportsController,
      ],
      providers: [
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: IntegrationsService, useValue: integrationsServiceMock },
        { provide: ApprovalsService, useValue: approvalsServiceMock },
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

  it('GET /notifications returns the user feed', async () => {
    notificationsServiceMock.findAllForUser.mockResolvedValue([{ id: 'n-1' }]);

    await request(app.getHttpServer())
      .get('/notifications')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([{ id: 'n-1' }]);
      });
  });

  it('PATCH /notifications/preferences updates delivery preferences', async () => {
    notificationsServiceMock.updatePreferences.mockResolvedValue({
      inApp: true,
      emailTasks: true,
    });

    await request(app.getHttpServer())
      .patch('/notifications/preferences')
      .send({ emailTasks: true, inApp: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ inApp: true, emailTasks: true });
      });
  });

  it('POST /integrations/webhooks creates a webhook config', async () => {
    integrationsServiceMock.createWebhook.mockResolvedValue({
      id: 'webhook-1',
      name: 'Alerts',
      url: 'https://example.com/webhook',
    });

    await request(app.getHttpServer())
      .post('/integrations/webhooks')
      .send({ name: 'Alerts', url: 'https://example.com/webhook' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe('webhook-1');
      });
  });

  it('GET /approvals/project/:projectId lists project approvals', async () => {
    approvalsServiceMock.listByProject.mockResolvedValue([{ id: 'approval-1', entityType: 'REPORT' }]);

    await request(app.getHttpServer())
      .get('/approvals/project/project-1')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([{ id: 'approval-1', entityType: 'REPORT' }]);
      });
  });

  it('POST /approvals approves an item', async () => {
    approvalsServiceMock.approve.mockResolvedValue({ id: 'approval-1', status: 'APPROVED' });

    await request(app.getHttpServer())
      .patch('/approvals/approval-1/approve')
      .send({ comment: 'Looks good' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });
  });

  it('POST /project-reports/:reportId/export-pdf returns the export payload', async () => {
    reportBuilderServiceMock.exportProjectReportPdf.mockResolvedValue({
      fileName: 'report.pdf',
      downloadUrl: 'https://example.com/report.pdf',
    });

    await request(app.getHttpServer())
      .post('/project-reports/report-1/export-pdf')
      .send({ locale: 'en' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          fileName: 'report.pdf',
          downloadUrl: 'https://example.com/report.pdf',
        });
      });
  });
});
