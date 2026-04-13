import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/permissions.guard';
import * as puppeteer from 'puppeteer';
import { existsSync } from 'fs';
import { AiService } from '../ai/ai.service';
import { ActivityService } from '../activity/activity.service';
import {
  AssignClientReportTemplateDto,
  CreateProjectReportDto,
  CreateProjectReportEntryDto,
  CreateReportBuilderTemplateDto,
  CreateReportBuilderTemplateVersionDto,
  ReorderProjectReportEntriesDto,
  UpdateClientReportTemplateAssignmentDto,
  UpdateProjectReportDto,
  UpdateProjectReportEntryDto,
  UpdateReportBuilderTemplateDto,
} from './dto/report-builder.dto';
import {
  ACCESSIBILITY_AUDIT_CATEGORIES,
  ACCESSIBILITY_AUDIT_MAIN_CATEGORIES,
} from './accessibility-audit.config';
import { FileCategory, FileScopeType, FileVisibility, GlobalRole, ProjectReportMediaType } from '@prisma/client';

@Injectable()
export class ReportBuilderService {
  private readonly logger = new Logger(ReportBuilderService.name);
  private static readonly cp1252ReverseMap: Record<number, number> = {
    0x20ac: 0x80,
    0x201a: 0x82,
    0x0192: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x02c6: 0x88,
    0x2030: 0x89,
    0x0160: 0x8a,
    0x2039: 0x8b,
    0x0152: 0x8c,
    0x017d: 0x8e,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x02dc: 0x98,
    0x2122: 0x99,
    0x0161: 0x9a,
    0x203a: 0x9b,
    0x0153: 0x9c,
    0x017e: 0x9e,
    0x0178: 0x9f,
  };
  private static readonly mojibakeMarkerRegex =
    /[ØÙÚÛ]|[\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly aiService: AiService,
    private readonly activity: ActivityService,
  ) {}

  private normalizeCode(code: string) {
    return code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private normalizePreviewLocale(locale?: string | null): 'en' | 'ar' | undefined {
    if (!locale) return undefined;
    return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
  }

  private resolvePreviewDirection(locale: 'en' | 'ar'): 'ltr' | 'rtl' {
    return locale === 'ar' ? 'rtl' : 'ltr';
  }

  private async resolveClientLogoUrl(logoId: string | null | undefined) {
    if (!logoId) return undefined;
    if (logoId.startsWith('http')) return logoId;

    try {
      const file = await this.prisma.fileAsset.findUnique({
        where: { id: logoId },
      });
      if (!file) return undefined;
      return await this.storage.getSignedUrl(file.storageKey, 3600, false);
    } catch (error) {
      this.logger.warn(`Failed to resolve client logo for report rendering: ${error?.message || error}`);
      return undefined;
    }
  }

  private normalizeAccessibilityToken(value?: string | null) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private normalizeAccessibilityCategory(value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    const directMatch = ACCESSIBILITY_AUDIT_MAIN_CATEGORIES.find((category) => category === trimmed);
    if (directMatch) return directMatch;

    const normalized = this.normalizeAccessibilityToken(trimmed);
    const aliasMap: Record<string, string> = {
      content: 'Content',
      images: 'Images',
      color: 'Color & Contrast',
      contrast: 'Color & Contrast',
      'color-contrast': 'Color & Contrast',
      'colour-contrast': 'Color & Contrast',
      navigation: 'Keyboard & Navigation',
      keyboard: 'Keyboard & Navigation',
      'keyboard-navigation': 'Keyboard & Navigation',
      'keyboard-and-navigation': 'Keyboard & Navigation',
      forms: 'Forms & Inputs',
      inputs: 'Forms & Inputs',
      'forms-inputs': 'Forms & Inputs',
      'forms-and-inputs': 'Forms & Inputs',
      multimedia: 'Multimedia',
      touch: 'Touch & Mobile',
      mobile: 'Touch & Mobile',
      'touch-mobile': 'Touch & Mobile',
      'touch-and-mobile': 'Touch & Mobile',
      structure: 'Structure & Semantics',
      semantics: 'Structure & Semantics',
      'structure-semantics': 'Structure & Semantics',
      'structure-and-semantics': 'Structure & Semantics',
      timing: 'Timing & Interaction',
      interaction: 'Timing & Interaction',
      'timing-interaction': 'Timing & Interaction',
      'timing-and-interaction': 'Timing & Interaction',
      assistive: 'Assistive Technology',
      technology: 'Assistive Technology',
      'assistive-technology': 'Assistive Technology',
      authentication: 'Authentication & Security',
      security: 'Authentication & Security',
      'authentication-security': 'Authentication & Security',
      'authentication-and-security': 'Authentication & Security',
    };

    if (aliasMap[normalized]) return aliasMap[normalized];

    return (
      ACCESSIBILITY_AUDIT_MAIN_CATEGORIES.find(
        (category) => this.normalizeAccessibilityToken(category) === normalized,
      ) || null
    );
  }

  private normalizeAccessibilitySubcategory(category: string, value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    const options = ACCESSIBILITY_AUDIT_CATEGORIES[category as keyof typeof ACCESSIBILITY_AUDIT_CATEGORIES] || [];
    const directMatch = options.find((option) => option === trimmed);
    if (directMatch) return directMatch;

    const normalized = this.normalizeAccessibilityToken(trimmed);
    return options.find((option) => this.normalizeAccessibilityToken(option) === normalized) || null;
  }

  private getAllowedAccessibilityTaxonomy(version?: { taxonomyJson?: any } | null) {
    const rawCategories = Array.isArray(version?.taxonomyJson?.accessibilityCategories)
      ? version?.taxonomyJson?.accessibilityCategories
      : [];
    const selectedCategories = rawCategories
      .map((item: any) =>
        this.normalizeAccessibilityCategory(typeof item === 'string' ? item : item?.value),
      )
      .filter(
        (value: any): value is string => typeof value === 'string' && value.trim().length > 0,
      );

    const categories: string[] = Array.from(
      new Set(selectedCategories.length > 0 ? selectedCategories : [...ACCESSIBILITY_AUDIT_MAIN_CATEGORIES]),
    );

    const subcategorySource = version?.taxonomyJson?.accessibilitySubcategories || {};
    const subcategories: Record<string, string[]> = {};

    categories.forEach((category: string) => {
      const rawItems = Array.isArray(subcategorySource?.[category]) ? subcategorySource[category] : [];
      const selected = rawItems.reduce<string[]>((acc, item: any) => {
        const normalized = this.normalizeAccessibilitySubcategory(
          category,
          typeof item === 'string' ? item : item?.value,
        );
        if (typeof normalized === 'string' && normalized.trim().length > 0) {
          acc.push(normalized);
        }
        return acc;
      }, []);
      const categoryOptions = [
        ...(ACCESSIBILITY_AUDIT_CATEGORIES[category as keyof typeof ACCESSIBILITY_AUDIT_CATEGORIES] || []),
      ] as string[];

      subcategories[category] =
        selected.length > 0
          ? Array.from(new Set(selected))
          : categoryOptions;
    });

    return { categories, subcategories };
  }

  private validateAccessibilityEntryInput(
    report: { template?: { category?: string | null }; templateVersion?: { taxonomyJson?: any } | null },
    input: {
      serviceName?: string | null;
      issueTitle?: string | null;
      issueDescription?: string | null;
      severity?: string | null;
      category?: string | null;
      subcategory?: string | null;
      pageUrl?: string | null;
      recommendation?: string | null;
      rowDataJson?: Record<string, unknown> | null;
    },
  ) {
    if (report.template?.category !== 'ACCESSIBILITY') {
      if (!input.serviceName?.trim()) {
        throw new BadRequestException('Service name is required for report entries.');
      }
      if (!input.issueTitle?.trim()) {
        throw new BadRequestException('Title is required for report entries.');
      }
      if (!input.issueDescription?.trim()) {
        throw new BadRequestException('Description is required for report entries.');
      }
      return;
    }

    const auditOutcome = this.getAuditOutcome(input.rowDataJson);
    const requiresSeverity = auditOutcome === 'FAIL' || auditOutcome === 'PARTIAL';
    const requiresRecommendation = requiresSeverity;
    const requiresSubcategory = requiresSeverity;

    if (!input.serviceName?.trim()) {
      throw new BadRequestException('Service name is required for accessibility audit results.');
    }
    if (!input.issueTitle?.trim()) {
      throw new BadRequestException('Title is required for accessibility audit results.');
    }
    if (!input.issueDescription?.trim()) {
      throw new BadRequestException('Description is required for accessibility audit results.');
    }
    if (requiresSeverity && !input.severity) {
      throw new BadRequestException('Severity is required when an accessibility result has an issue or is partially working.');
    }
    if (!input.category?.trim()) {
      throw new BadRequestException('Main category is required for accessibility audit results.');
    }
    if (requiresSubcategory && !input.subcategory?.trim()) {
      throw new BadRequestException('Subcategory is required when an accessibility result has an issue or is partially working.');
    }
    if (!input.pageUrl?.trim()) {
      throw new BadRequestException('Page URL is required for accessibility audit results.');
    }
    if (requiresRecommendation && !input.recommendation?.trim()) {
      throw new BadRequestException('Recommendations are required when an accessibility result needs follow-up.');
    }

    if (input.severity === 'CRITICAL') {
      throw new BadRequestException('Accessibility findings support HIGH, MEDIUM, or LOW severity only.');
    }

    const category = this.normalizeAccessibilityCategory(input.category);
    const subcategory = category
      ? this.normalizeAccessibilitySubcategory(category, input.subcategory)
      : input.subcategory?.trim();

    if (!category && subcategory) {
      throw new BadRequestException('Select a main category before choosing a subcategory.');
    }

    const allowedTaxonomy = this.getAllowedAccessibilityTaxonomy(report.templateVersion);

    if (category && !allowedTaxonomy.categories.includes(category) && !ACCESSIBILITY_AUDIT_MAIN_CATEGORIES.includes(category)) {
      throw new BadRequestException('Category must match the accessibility audit category list.');
    }

    if (subcategory) {
      const allowedSubcategories: string[] = category ? [...(allowedTaxonomy.subcategories[category] || [])] : [];
      const categoryOptions: string[] = category
        ? ([...(ACCESSIBILITY_AUDIT_CATEGORIES[category as keyof typeof ACCESSIBILITY_AUDIT_CATEGORIES] || [])] as string[])
        : [];

      if (
        !allowedSubcategories.includes(subcategory) &&
        !categoryOptions.includes(subcategory)
      ) {
        throw new BadRequestException('Subcategory must match the selected accessibility audit category.');
      }
    }
  }

  private async ensureClientInOrg(clientId: string, orgId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, orgId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private async ensureTemplateInOrg(templateId: string, orgId: string) {
    const template = await this.prisma.reportBuilderTemplate.findFirst({
      where: { id: templateId, orgId },
    });
    if (!template) throw new NotFoundException('Accessibility tool not found');
    return template;
  }

  private async ensureProjectAccess(projectId: string, user: UserWithRoles) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null, ...ScopeUtils.projectScope(user) },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async ensureProjectReportAccess(reportId: string, user: UserWithRoles) {
    const isClientUser = this.isClientUser(user.role);
    const report = await this.prisma.projectReport.findFirst({
      where: {
        id: reportId,
        deletedAt: null,
        orgId: user.orgId,
        project: ScopeUtils.projectScope(user),
        ...(isClientUser && {
          status: 'PUBLISHED',
          visibility: 'CLIENT',
        }),
      },
      include: {
        project: true,
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!report) throw new NotFoundException('Project report not found');
    if (report.status === 'PUBLISHED' && report.visibility === 'CLIENT') {
      await this.promoteProjectReportAssetsForClient(report.id, report.orgId, report.projectId);
    }
    return report;
  }

  private async promoteProjectReportAssetsForClient(reportId: string, orgId: string, projectId: string) {
    const [mediaLinks, exportLinks] = await Promise.all([
      this.prisma.projectReportEntryMedia.findMany({
        where: {
          entry: {
            projectReportId: reportId,
            orgId,
            deletedAt: null,
          },
        },
        select: { fileAssetId: true },
      }),
      this.prisma.projectReportExport.findMany({
        where: {
          projectReportId: reportId,
          orgId,
        },
        select: { fileAssetId: true },
      }),
    ]);

    const fileAssetIds = Array.from(
      new Set(
        [...mediaLinks, ...exportLinks]
          .map((link) => link.fileAssetId)
          .filter((fileAssetId): fileAssetId is string => typeof fileAssetId === 'string' && fileAssetId.length > 0),
      ),
    );

    if (!fileAssetIds.length) return;

    await this.prisma.fileAsset.updateMany({
      where: {
        id: { in: fileAssetIds },
        orgId,
        projectId,
        visibility: { not: 'CLIENT' },
      },
      data: {
        visibility: 'CLIENT',
      },
    });
  }

  private async ensureProjectReportEntryAccess(reportId: string, entryId: string, user: UserWithRoles) {
    await this.ensureProjectReportAccess(reportId, user);
    const entry = await this.prisma.projectReportEntry.findFirst({
      where: {
        id: entryId,
        orgId: user.orgId,
        projectReportId: reportId,
        deletedAt: null,
      },
      include: {
        projectReport: true,
        media: {
          include: {
            fileAsset: true,
          },
        },
      },
    });
    if (!entry) throw new NotFoundException('Project report entry not found');
    return entry;
  }

  private hasPermission(user: UserWithRoles, permission: string) {
    if (user.role === GlobalRole.SUPER_ADMIN) return true;

    const rolePermissions = ROLE_DEFAULT_PERMISSIONS[user.role as GlobalRole] ?? [];
    const customPermissions = Array.isArray((user as any).customPermissions)
      ? ((user as any).customPermissions as string[])
      : [];

    return rolePermissions.includes(permission) || customPermissions.includes(permission);
  }

  private canPublishProjectReports(user: UserWithRoles) {
    return this.hasPermission(user, 'PUBLISH_PROJECT_REPORTS');
  }

  private ensureDraftReportContent(report: { status: string }) {
    if (report.status !== 'DRAFT') {
      throw new ForbiddenException('Only draft reports can be edited. Return the report to draft before changing findings or evidence.');
    }
  }

  private sanitizeFilename(filename: string) {
    return filename.replace(/[^\p{L}\p{N}._-]/gu, '_');
  }

  private isClientUser(role: string) {
    return ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'].includes(role);
  }

  private detectMediaType(mimeType: string): ProjectReportMediaType {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    return 'DOCUMENT';
  }

  private severityLabel(severity: string | null | undefined, locale: 'ar' | 'en' = 'ar') {
    const labels: Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', string> =
      locale === 'en'
        ? {
            CRITICAL: 'Critical',
            HIGH: 'High',
            MEDIUM: 'Medium',
            LOW: 'Low',
          }
        : {
            CRITICAL: '\u062D\u0631\u062C\u0629',
            HIGH: '\u0639\u0627\u0644\u064A\u0629',
            MEDIUM: '\u0645\u062A\u0648\u0633\u0637\u0629',
            LOW: '\u0645\u0646\u062E\u0641\u0636\u0629',
          };
    const normalizedSeverity = (severity || 'LOW') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    return labels[normalizedSeverity] || labels.LOW;
  }

  private async logActivity(data: {
    orgId: string;
    projectId?: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }) {
    this.activity.create(data).catch((error) => {
      this.logger.warn(`Failed to create activity feed entry for ${data.action}: ${error?.message || error}`);
    });
  }

  private async launchPdfBrowser() {
    const executablePath =
      this.config.get<string>('PUPPETEER_EXECUTABLE_PATH') || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (executablePath && !existsSync(executablePath)) {
      throw new ServiceUnavailableException(
        `PDF export runtime is misconfigured. Browser executable was not found at "${executablePath}". Run "npm run pdf:check" on the server and verify Puppeteer configuration.`,
      );
    }

    const disableSandbox =
      (this.config.get<string>('PUPPETEER_DISABLE_SANDBOX') || process.env.PUPPETEER_DISABLE_SANDBOX || 'true') !==
      'false';

    try {
      return await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: disableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
      });
    } catch (error: any) {
      this.logger.error(`Failed to start browser for PDF export: ${error?.message || error}`);
      throw new ServiceUnavailableException(
        'PDF export runtime is unavailable. Run "npm run pdf:check" on the server and verify Chromium dependencies before retrying export.',
      );
    }
  }

  private cp1252CharToByte(char: string): number | null {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== 'number') return null;
    if (codePoint <= 0xff) return codePoint;
    if (codePoint in ReportBuilderService.cp1252ReverseMap) {
      return ReportBuilderService.cp1252ReverseMap[codePoint];
    }
    return null;
  }

  private decodeMojibakeString(value: string): string {
    if (!ReportBuilderService.mojibakeMarkerRegex.test(value)) return value;

    try {
      const bytes: number[] = [];
      for (const char of Array.from(value)) {
        const byte = this.cp1252CharToByte(char);
        if (byte == null) return value;
        bytes.push(byte);
      }

      const decoded = Buffer.from(bytes).toString('utf8');
      return /[\u0600-\u06FF]/.test(decoded) ? decoded : value;
    } catch {
      return value;
    }
  }

  private escapeHtml(value?: unknown) {
    return this.normalizeDisplayText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private normalizeDisplayText(value?: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') {
      return this.decodeMojibakeString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeDisplayText(item))
        .filter(Boolean)
        .join('\n');
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferredKeys = ['text', 'value', 'label', 'title', 'description', 'message', 'summary', 'content'];
      for (const key of preferredKeys) {
        const candidate = this.normalizeDisplayText(record[key]);
        if (candidate) return candidate;
      }
      return Object.entries(record)
        .map(([key, nested]) => {
          const nestedText = this.normalizeDisplayText(nested);
          return nestedText ? `${key}: ${nestedText}` : key;
        })
        .join('\n');
    }
    return '';
  }

  private getTemplateLocale(version?: { schemaJson?: any; pdfConfigJson?: any } | null) {
    const schemaLocale = String(version?.schemaJson?.locale?.primary || version?.pdfConfigJson?.locale || 'en').toLowerCase();
    const direction = String(
      version?.schemaJson?.locale?.direction ||
        version?.pdfConfigJson?.direction ||
        (schemaLocale.startsWith('ar') ? 'rtl' : 'ltr'),
    ).toLowerCase();

    return {
      locale: schemaLocale.startsWith('ar') ? 'ar' : 'en',
      direction: direction === 'ltr' ? 'ltr' : 'rtl',
    } as const;
  }

  private resolveReportOutputLocale(
    report?: { outputLocale?: string | null; templateVersion?: { schemaJson?: any; pdfConfigJson?: any } | null } | null,
    localeOverride?: string,
  ) {
    const normalized = this.normalizePreviewLocale(localeOverride);
    if (normalized) {
      return {
        locale: normalized,
        direction: this.resolvePreviewDirection(normalized),
      } as const;
    }

    const savedLocale = this.normalizePreviewLocale(report?.outputLocale);
    if (savedLocale) {
      return {
        locale: savedLocale,
        direction: this.resolvePreviewDirection(savedLocale),
      } as const;
    }

    return this.getTemplateLocale(report?.templateVersion);
  }

  private getPreviewLocaleConfig(
    version?: { schemaJson?: any; pdfConfigJson?: any } | null,
    localeOverride?: string,
  ) {
    const normalized = this.normalizePreviewLocale(localeOverride);
    if (!normalized) {
      return this.getTemplateLocale(version);
    }
    return {
      locale: normalized,
      direction: this.resolvePreviewDirection(normalized),
    } as const;
  }

  private getPreviewLabels(locale: 'ar' | 'en') {
    if (locale === 'en') {
      return {
        previewTag: 'Arena360 accessibility report',
        coverTag: 'Accessibility audit report',
        introduction: 'Introduction',
        executiveSummary: 'Statistics summary',
        recommendationSummary: 'Recommendations summary',
        findingsTag: 'Detailed audit log',
        findingsTitle: 'Audit results table',
        noEntries: 'No audit results have been added yet.',
        footerNote:
          'This report is generated from the structured accessibility audit pipeline and exported directly to PDF from the server.',
        closingTag: 'End cover',
        closingTitle: 'Thank you',
        closingBody:
          'Improving accessibility for everyone.',
        client: 'Client',
        project: 'Project',
        template: 'Tool',
        reportDate: 'Report date',
        performedBy: 'Performed by',
        createdBy: 'Auditor',
        outcome: 'Result',
        compliancePercentage: 'Compliance percentage',
        workingChecks: 'Working checks',
        needsAttention: 'Needs attention',
        partiallyWorking: 'Partially working',
        notTested: 'Not tested',
        notApplicable: 'Not applicable',
        totalIssues: 'Total issues',
        clickHere: 'Click here',
        viewImage: 'View Image',
        viewVideo: 'View Video',
        viewEvidence: 'View Evidence',
        serviceName: 'Service Name',
        issueTitle: 'Issue Title',
        severity: 'Severity',
        category: 'Category',
        subcategory: 'Subcategory',
        pageUrl: 'Page URL',
        media: 'Media',
        statisticsTitle: 'Statistical snapshot',
        severityBreakdown: 'Issues by severity',
        categoryBreakdown: 'Issues by category',
        strengthsTitle: "What's working",
        strengthsBody: 'The following checks passed or were recorded as working correctly.',
        needsAttentionTitle: 'What needs attention',
        needsAttentionBody: 'The following checks failed or are only partially working and should be prioritized for follow-up.',
        coverageTitle: 'Audit coverage',
        scopeTitle: 'Audit scope',
        scopeBody: 'This audit reviews the recorded services, pages, and interface flows documented in the structured findings below.',
        methodologyTitle: 'Methodology',
        methodologyBody: 'The review combines manual expert inspection with assisted tooling checks to identify barriers affecting usability and compliance.',
        standardsTitle: 'Reference standards',
        standardsBody: 'Findings are documented against accessibility best practices aligned with WCAG success criteria where applicable.',
        recommendationsTitle: 'Recommendations summary',
        closingThanks: 'Thank you for reviewing this report.',
        generatedWith: 'Generated by Arena360',
        sampleDescription:
          'This accessibility audit report consolidates project findings, evidence, AI-generated narrative sections, and export-ready formatting in one landscape document.',
      };
    }

    return {
      previewTag: 'تقرير إمكانية الوصول من Arena360',
      coverTag: 'تقرير تدقيق إمكانية الوصول',
      introduction: '\u0627\u0644\u0645\u0642\u062F\u0645\u0629',
      executiveSummary: 'ملخص الإحصاءات',
      recommendationSummary: 'ملخص التوصيات',
      findingsTag: 'سجل الملاحظات التفصيلي',
      findingsTitle: 'جدول الملاحظات',
      noEntries: '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0645\u0636\u0627\u0641\u0629 \u0628\u0639\u062F.',
      footerNote:
        'يتم إنشاء هذا التقرير من مسار التصدير المنظم للملاحظات ثم تصديره مباشرة إلى PDF من الخادم.',
      closingTag: 'الغلاف الختامي',
      closingTitle: 'شكراً لكم',
      closingBody:
        'نعمل من أجل تحسين إمكانية الوصول للجميع.',
      client: '\u0627\u0644\u0639\u0645\u064A\u0644',
      project: '\u0627\u0644\u0645\u0634\u0631\u0648\u0639',
      template: '\u0627\u0644\u0623\u062F\u0627\u0629',
      reportDate: 'تاريخ التقرير',
      performedBy: '\u062A\u0645 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0628\u0648\u0627\u0633\u0637\u0629',
      createdBy: 'المدقق',
      outcome: '\u0627\u0644\u0646\u062A\u064A\u062C\u0629',
      compliancePercentage: '\u0646\u0633\u0628\u0629 \u0627\u0644\u0627\u0645\u062A\u062B\u0627\u0644',
      workingChecks: '\u0645\u0627 \u064A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u0635\u062D\u064A\u062D',
      needsAttention: '\u064A\u062D\u062A\u0627\u062C \u0645\u0639\u0627\u0644\u062C\u0629',
      partiallyWorking: '\u064A\u0639\u0645\u0644 \u062C\u0632\u0626\u064A\u0627',
      notTested: '\u0644\u0645 \u064A\u062A\u0645 \u0627\u062E\u062A\u0628\u0627\u0631\u0647',
      notApplicable: '\u063A\u064A\u0631 \u0645\u0646\u0637\u0628\u0642',
      totalIssues: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A',
      clickHere: '\u0627\u0636\u063A\u0637 \u0647\u0646\u0627',
      viewImage: '\u0639\u0631\u0636 \u0627\u0644\u0635\u0648\u0631\u0629',
      viewVideo: '\u0639\u0631\u0636 \u0627\u0644\u0641\u064A\u062F\u064A\u0648',
      viewEvidence: '\u0639\u0631\u0636 \u0627\u0644\u062F\u0644\u064A\u0644',
      serviceName: 'اسم الخدمة',
      issueTitle: 'عنوان المشكلة',
      severity: 'الشدة',
      category: 'التصنيف',
      subcategory: 'التصنيف الفرعي',
      pageUrl: '\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629',
      media: 'الوسائط',
      statisticsTitle: 'اللقطة الإحصائية',
      severityBreakdown: 'الملاحظات حسب الشدة',
      categoryBreakdown: 'الملاحظات حسب التصنيف',
      strengthsTitle: '\u0645\u0627 \u064A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u062C\u064A\u062F',
      strengthsBody: '\u0627\u0644\u0628\u0646\u0648\u062F \u0627\u0644\u062A\u0627\u0644\u064A\u0629 \u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0623\u0646\u0647\u0627 \u062A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u0635\u062D\u064A\u062D.',
      needsAttentionTitle: '\u0645\u0627 \u064A\u062D\u062A\u0627\u062C \u0645\u0639\u0627\u0644\u062C\u0629',
      needsAttentionBody: '\u0627\u0644\u0628\u0646\u0648\u062F \u0627\u0644\u062A\u0627\u0644\u064A\u0629 \u0641\u0634\u0644\u062A \u0623\u0648 \u062A\u0639\u0645\u0644 \u062C\u0632\u0626\u064A\u0627 \u0648\u064A\u062C\u0628 \u0645\u062A\u0627\u0628\u0639\u062A\u0647\u0627.',
      coverageTitle: '\u0646\u0637\u0627\u0642 \u0627\u0644\u062A\u062F\u0642\u064A\u0642',
      scopeTitle: 'نطاق التدقيق',
      scopeBody: 'يغطي هذا التدقيق الخدمات والصفحات وتدفقات الاستخدام الموثقة ضمن الملاحظات المنظمة الواردة أدناه.',
      methodologyTitle: 'منهجية العمل',
      methodologyBody: 'تمت المراجعة بالجمع بين الفحص اليدوي المتخصص والاختبارات المساندة بالأدوات لتحديد العوائق المؤثرة على قابلية الاستخدام والامتثال.',
      standardsTitle: 'المعايير المرجعية',
      standardsBody: 'تم توثيق الملاحظات وفق أفضل ممارسات إمكانية الوصول وبما يتوافق مع معايير WCAG عند الحاجة.',
      recommendationsTitle: 'ملخص التوصيات',
      closingThanks: 'شكراً لكم على مراجعة هذا التقرير.',
      generatedWith: 'تم الإنشاء بواسطة Arena360',
      sampleDescription:
        'يجمع هذا التقرير بين ملاحظات المشروع وأدلته والنصوص المولدة بالذكاء الاصطناعي والتنسيق الجاهز للتصدير ضمن مستند أفقي واحد.',
    };
  }

  private getSchemaField(version: { schemaJson?: any } | null | undefined, key: string) {
    const entryFields = Array.isArray(version?.schemaJson?.entryFields) ? version?.schemaJson?.entryFields : [];
    return entryFields.find((field: any) => field?.key === key);
  }

  private getSchemaLabel(
    version: { schemaJson?: any } | null | undefined,
    key: string,
    locale: 'ar' | 'en',
    fallback: string,
  ) {
    const field = this.getSchemaField(version, key);
    const rawLabel = typeof field?.label === 'string' ? field.label : undefined;
    const rawLabelEn = typeof field?.labelEn === 'string' ? field.labelEn : undefined;
    const rawLabelAr = typeof field?.labelAr === 'string' ? field.labelAr : undefined;
    const looksArabic = (value?: string) => !!value && /[\u0600-\u06FF]/.test(value);
    const value =
      locale === 'en'
        ? rawLabelEn || (!looksArabic(rawLabel) ? rawLabel : undefined) || fallback
        : rawLabelAr || (looksArabic(rawLabel) ? rawLabel : undefined) || fallback;
    return this.normalizeDisplayText(String(value || fallback));
  }

  private formatReportDate(value: string | Date | null | undefined, locale: 'ar' | 'en') {
    if (!value) return locale === 'ar' ? 'غير متوفر' : 'Not available';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return locale === 'ar' ? 'غير متوفر' : 'Not available';
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private getAccessibilityCategoryDisplay(value: string | null | undefined, locale: 'ar' | 'en') {
    const normalized = this.normalizeAccessibilityCategory(value);
    if (!normalized) return this.normalizeDisplayText(value);
    if (locale === 'en') return normalized;

    const labels: Record<string, string> = {
      Images: 'الصور',
      Content: 'المحتوى',
      'Color & Contrast': 'الألوان والتباين',
      'Keyboard & Navigation': 'لوحة المفاتيح والتنقل',
      'Forms & Inputs': 'النماذج وحقول الإدخال',
      Multimedia: 'الوسائط المتعددة',
      'Touch & Mobile': 'اللمس والجوال',
      'Structure & Semantics': 'البنية والدلالات',
      'Timing & Interaction': 'التوقيت والتفاعل',
      'Assistive Technology': 'التقنيات المساعدة',
      'Authentication & Security': 'المصادقة والأمان',
    };
    return labels[normalized] || normalized;
  }

  private getAuditOutcome(rowDataJson?: Record<string, unknown> | null) {
    const candidate = rowDataJson?.auditOutcome;
    if (
      candidate === 'PASS' ||
      candidate === 'FAIL' ||
      candidate === 'PARTIAL' ||
      candidate === 'NOT_APPLICABLE' ||
      candidate === 'NOT_TESTED'
    ) {
      return candidate;
    }
    return 'FAIL';
  }

  private getAuditOutcomeLabel(outcome: string | null | undefined, locale: 'ar' | 'en') {
    const normalized = this.getAuditOutcome({ auditOutcome: outcome || undefined });
    if (locale === 'ar') {
      if (normalized === 'PASS') return 'يعمل بشكل صحيح';
      if (normalized === 'PARTIAL') return 'يعمل جزئيا';
      if (normalized === 'NOT_APPLICABLE') return 'غير منطبق';
      if (normalized === 'NOT_TESTED') return 'لم يتم اختباره';
      return 'يحتاج معالجة';
    }

    if (normalized === 'PASS') return 'Working';
    if (normalized === 'PARTIAL') return 'Partially working';
    if (normalized === 'NOT_APPLICABLE') return 'Not applicable';
    if (normalized === 'NOT_TESTED') return 'Not tested';
    return 'Needs attention';
  }

  private getAuditMetrics(entries: Array<{ severity?: string | null; rowDataJson?: Record<string, unknown> | null }>) {
    const counts = entries.reduce(
      (acc, entry) => {
        const outcome = this.getAuditOutcome(entry.rowDataJson);
        acc.total += 1;
        if (outcome === 'PASS') acc.pass += 1;
        if (outcome === 'FAIL') acc.fail += 1;
        if (outcome === 'PARTIAL') acc.partial += 1;
        if (outcome === 'NOT_APPLICABLE') acc.notApplicable += 1;
        if (outcome === 'NOT_TESTED') acc.notTested += 1;
        if (entry.severity === 'HIGH') acc.high += 1;
        if (entry.severity === 'MEDIUM') acc.medium += 1;
        if (entry.severity === 'LOW') acc.low += 1;
        if (entry.severity === 'CRITICAL') acc.critical += 1;
        return acc;
      },
      {
        total: 0,
        pass: 0,
        fail: 0,
        partial: 0,
        notApplicable: 0,
        notTested: 0,
        high: 0,
        medium: 0,
        low: 0,
        critical: 0,
      },
    );
    const scoredChecks = counts.pass + counts.fail + counts.partial;
    const compliancePercentage = scoredChecks > 0 ? Math.round(((counts.pass + counts.partial * 0.5) / scoredChecks) * 100) : 0;
    return {
      ...counts,
      scoredChecks,
      compliancePercentage,
    };
  }

  private buildRecommendationBullets(summaryText: unknown, entries: Array<{ recommendation?: string | null }>, locale: 'ar' | 'en') {
    const directBullets = this.normalizeDisplayText(summaryText)
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-\u2022]+/, '').trim())
      .filter(Boolean);

    if (directBullets.length > 1) {
      return directBullets;
    }

    const deduped = Array.from(
      new Set(
        entries
          .map((entry) => this.normalizeDisplayText(entry.recommendation))
          .map((value) => value.replace(/^[\s•\-\u2022]+/, '').trim())
          .filter(Boolean),
      ),
    );

    if (deduped.length > 0) {
      return deduped;
    }

    if (entries.length === 0) {
      return [
        locale === 'ar'
          ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0634\u0643\u0644\u0627\u062A \u0645\u0641\u062A\u0648\u062D\u0629 \u0645\u0648\u062B\u0642\u0629 \u062D\u0627\u0644\u064A\u0627. \u064A\u0648\u0635\u0649 \u0628\u0627\u0644\u062D\u0641\u0627\u0638 \u0639\u0644\u0649 \u0627\u0644\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u062D\u0627\u0644\u064A \u0648\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0628\u0639\u062F \u0623\u064A \u062A\u063A\u064A\u064A\u0631\u0627\u062A \u0643\u0628\u064A\u0631\u0629.'
          : 'No open issues are currently documented. Maintain the current accessibility baseline and retest after major changes.',
      ];
    }

    return [
      locale === 'ar'
        ? 'مراجعة العناصر عالية ومتوسطة الشدة أولاً، ثم تنفيذ التحسينات المتكررة على مستوى النظام.'
        : 'Prioritize high and medium severity issues first, then address repeated accessibility patterns across the system.',
    ];
  }

  private buildSampleTemplatePreviewData(template: any, version: any, localeOverride?: string) {
    const { locale, direction } = this.getPreviewLocaleConfig(version, localeOverride);
    const labels = this.getPreviewLabels(locale);
    if (template?.category !== 'ACCESSIBILITY') {
      const projectName = locale === 'ar' ? 'مشروع تجريبي' : 'Sample Project';
      const clientName = locale === 'ar' ? 'عميل تجريبي' : 'Sample Client';
      const performerName = locale === 'ar' ? 'فريق التنفيذ' : 'Delivery Team';
      const reportTitle = locale === 'ar' ? `${this.normalizeDisplayText(template.name)} - معاينة` : `${this.normalizeDisplayText(template.name)} - Sample Preview`;
      return {
        report: {
          title: reportTitle,
          description: locale === 'ar'
            ? 'توضح هذه المعاينة الشكل العام للقالب قبل تعيينه للعميل.'
            : 'This preview demonstrates the overall template layout before it is assigned to a client.',
          client: { name: clientName, logo: null },
          project: { name: projectName },
          template: { name: this.normalizeDisplayText(template.name) },
          templateVersion: version,
          performedBy: { name: performerName },
          summaryJson: {
            introduction: locale === 'ar'
              ? 'تسمح هذه المعاينة للإدارة بمراجعة شكل القالب ومحتواه قبل النشر.'
              : 'This preview lets admins review the template shape and content before publishing.',
            statisticsSummary: locale === 'ar'
              ? 'تُعرض هنا الأرقام والعناوين الأساسية باستخدام الحقول المحددة داخل القالب.'
              : 'Key statistics and headings are rendered here using the fields defined in the template.',
            recommendationsSummary: locale === 'ar'
              ? 'تُستخدم هذه البيانات التجريبية فقط لتوضيح طريقة العرض النهائية.'
              : 'These sample values are only for illustrating the final rendered layout.',
          },
        },
        entries: [
          {
            serviceName: locale === 'ar' ? 'لوحة القيادة' : 'Dashboard',
            issueTitle: locale === 'ar' ? 'المراجعة الدورية ناجحة' : 'Routine review completed',
            issueDescription: locale === 'ar' ? 'يتم عرض هذه النتيجة كعنصر إيجابي في القالب.' : 'This item is shown as a positive entry in the template.',
            category: locale === 'ar' ? 'العمليات' : 'Operations',
            subcategory: locale === 'ar' ? 'المراجعة' : 'Review',
            pageUrl: 'https://example.com',
            recommendation: '',
            rowDataJson: { auditOutcome: 'PASS' },
            media: [],
          },
          {
            serviceName: locale === 'ar' ? 'تقارير العملاء' : 'Client Reports',
            issueTitle: locale === 'ar' ? 'عنصر يحتاج متابعة' : 'Item requiring follow-up',
            issueDescription: locale === 'ar' ? 'هذا المثال يوضح كيف تظهر الملاحظات والحقول الإضافية.' : 'This example demonstrates how findings and additional fields appear.',
            severity: 'MEDIUM',
            category: locale === 'ar' ? 'المحتوى' : 'Content',
            subcategory: locale === 'ar' ? 'تحديث المحتوى' : 'Content update',
            pageUrl: 'https://example.com/client',
            recommendation: locale === 'ar' ? 'تحديث الوصف وإضافة التفاصيل المطلوبة.' : 'Update the description and add the required details.',
            rowDataJson: { auditOutcome: 'FAIL' },
            media: [],
          },
        ],
        locale,
        direction,
      };
    }
    const categoryValue =
      version?.taxonomyJson?.accessibilityCategories?.[0]?.value || ACCESSIBILITY_AUDIT_MAIN_CATEGORIES[0];
    const subcategoryValue =
      version?.taxonomyJson?.accessibilitySubcategories?.[categoryValue]?.[0]?.value ||
      ACCESSIBILITY_AUDIT_CATEGORIES[categoryValue as keyof typeof ACCESSIBILITY_AUDIT_CATEGORIES]?.[0] ||
      '';
    const sampleImage =
      'data:image/svg+xml;charset=UTF-8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#f4e6ea" rx="18" /><rect x="24" y="28" width="272" height="18" fill="#8a1538" opacity="0.18" rx="9" /><rect x="24" y="64" width="184" height="14" fill="#8a1538" opacity="0.12" rx="7" /><rect x="24" y="90" width="220" height="14" fill="#8a1538" opacity="0.08" rx="7" /><rect x="24" y="132" width="112" height="32" fill="#8a1538" opacity="0.16" rx="10" /><text x="160" y="182" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#6b7280">Sample evidence</text></svg>',
      );

    const projectName = locale === 'ar' ? '\u0645\u0634\u0631\u0648\u0639 \u062A\u062C\u0631\u064A\u0628\u064A \u0644\u0644\u0648\u0635\u0648\u0644' : 'Accessibility Pilot Project';
    const clientName = locale === 'ar' ? '\u0639\u0645\u064A\u0644 \u062A\u062C\u0631\u064A\u0628\u064A' : 'Sample Client';
    const performerName = locale === 'ar' ? '\u0641\u0631\u064A\u0642 \u0627\u0644\u062C\u0648\u062F\u0629' : 'QA Team';
    const reportTitle =
      locale === 'ar'
        ? this.normalizeDisplayText(template.name) + ' - ' + '\u0645\u0639\u0627\u064A\u0646\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629'
        : this.normalizeDisplayText(template.name) + ' - Sample Preview';

    return {
      report: {
        title: reportTitle,
        description: labels.sampleDescription,
        client: { name: clientName, logo: null },
        project: { name: projectName },
        template: { name: this.normalizeDisplayText(template.name) },
        templateVersion: version,
        performedBy: { name: performerName },
        summaryJson: {
          introduction:
            locale === 'ar'
              ? '\u064A\u0642\u062F\u0645 \u0647\u0630\u0627 \u0627\u0644\u0642\u0627\u0644\u0628 \u0645\u0644\u062E\u0635\u0627\u064B \u0648\u0627\u0636\u062D\u0627\u064B \u0644\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0648\u064A\u0631\u0627\u0639\u064A \u0627\u0644\u0625\u062E\u0631\u0627\u062C \u0627\u0644\u0639\u0631\u0628\u064A \u0628\u0627\u062A\u062C\u0627\u0647 RTL.'
              : 'This tool preview demonstrates the final report layout with a polished cover, evidence handling, and structured findings.',
          statisticsSummary:
            locale === 'ar'
              ? '\u064A\u0645\u0643\u0646 \u0644\u0644\u0625\u062F\u0627\u0631\u0629 \u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u0642\u0627\u0644\u0628 \u0642\u0628\u0644 \u062A\u0639\u064A\u064A\u0646\u0647 \u0644\u0644\u0639\u0645\u064A\u0644 \u0644\u0636\u0645\u0627\u0646 \u0623\u0646 \u0634\u0643\u0644 \u0627\u0644\u062A\u0635\u062F\u064A\u0631 \u064A\u0637\u0627\u0628\u0642 \u0627\u0644\u062A\u0648\u0642\u0639\u0627\u062A.'
              : 'Admins can review the output here before assigning the tool to a client, so the exported PDF style is predictable.',
          executiveSummary:
            locale === 'ar'
              ? '\u064A\u0645\u0643\u0646 \u0644\u0644\u0625\u062F\u0627\u0631\u0629 \u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u0642\u0627\u0644\u0628 \u0642\u0628\u0644 \u062A\u0639\u064A\u064A\u0646\u0647 \u0644\u0644\u0639\u0645\u064A\u0644 \u0644\u0636\u0645\u0627\u0646 \u0623\u0646 \u0634\u0643\u0644 \u0627\u0644\u062A\u0635\u062F\u064A\u0631 \u064A\u0637\u0627\u0628\u0642 \u0627\u0644\u062A\u0648\u0642\u0639\u0627\u062A.'
              : 'Admins can review the output here before assigning the tool to a client, so the exported PDF style is predictable.',
          strengthsSummary:
            locale === 'ar'
              ? '\u064A\u0648\u0636\u062D \u0647\u0630\u0627 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0643\u064A\u0641 \u062A\u0638\u0647\u0631 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062A\u064A \u062A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u062C\u064A\u062F \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0642\u0631\u064A\u0631.'
              : 'This sample also demonstrates how positive audit outcomes appear inside the final report.',
          complianceSummary:
            locale === 'ar'
              ? '\u062A\u062D\u062A\u0633\u0628 \u0646\u0633\u0628\u0629 \u0627\u0644\u0627\u0645\u062A\u062B\u0627\u0644 \u0645\u0646 \u0627\u0644\u0628\u0646\u0648\u062F \u0627\u0644\u0646\u0627\u062C\u062D\u0629 \u0648\u0627\u0644\u0628\u0646\u0648\u062F \u0627\u0644\u062C\u0632\u0626\u064A\u0629 \u0648\u0627\u0644\u0628\u0646\u0648\u062F \u0627\u0644\u062A\u064A \u0641\u0634\u0644\u062A \u0641\u0642\u0637.'
              : 'Compliance is calculated from passed, failed, and partial checks only, while not-tested and not-applicable items stay visible but excluded from scoring.',
          recommendationsSummary:
            locale === 'ar'
              ? '\u064A\u0633\u062A\u0639\u0645\u0644 \u0647\u0630\u0627 \u0627\u0644\u0645\u062E\u0631\u062C \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629\u060C \u0623\u0645\u0627 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0641\u0639\u0644\u064A\u0629 \u0641\u062A\u0623\u062E\u0630 \u0645\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u062D\u0642\u064A\u0642\u064A\u0629.'
              : 'This sample uses mock data only. Real project reports will render with live findings, evidence, and AI-assisted summaries.',
        },
      },
      entries: [
        {
          serviceName: locale === 'ar' ? '\u0627\u0644\u062A\u0646\u0642\u0644 \u0627\u0644\u0631\u0626\u064A\u0633\u064A' : 'Primary Navigation',
          issueTitle: locale === 'ar' ? '\u0648\u0636\u0648\u062D \u0645\u0624\u0634\u0631 \u0627\u0644\u062A\u0631\u0643\u064A\u0632' : 'Visible focus indicator works correctly',
          issueDescription:
            locale === 'ar'
              ? '\u062A\u0645 \u0627\u0644\u062A\u0623\u0643\u062F \u0623\u0646 \u0645\u0624\u0634\u0631 \u0627\u0644\u062A\u0631\u0643\u064A\u0632 \u0638\u0627\u0647\u0631 \u0628\u0634\u0643\u0644 \u0648\u0627\u0636\u062D \u0639\u0646\u062F \u0627\u0644\u062A\u0646\u0642\u0644 \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D.'
              : 'Keyboard focus is clearly visible while moving through the main navigation.',
          category: 'Keyboard & Navigation',
          subcategory: 'Missing focus indicator',
          pageUrl: 'https://example.com',
          recommendation: '',
          rowDataJson: { auditOutcome: 'PASS' },
          media: [],
        },
        {
          serviceName: locale === 'ar' ? '\u0634\u0627\u0634\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644' : 'Login Screen',
          issueTitle: locale === 'ar' ? '\u063A\u064A\u0627\u0628 \u062A\u0633\u0645\u064A\u0627\u062A \u0648\u0627\u0636\u062D\u0629 \u0644\u0644\u062D\u0642\u0648\u0644' : 'Missing clear field labels',
          issueDescription:
            locale === 'ar'
              ? '\u0627\u0644\u062D\u0642\u0648\u0644 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 \u0644\u0627 \u062A\u062D\u0645\u0644 \u0623\u0648\u0635\u0627\u0641\u064B\u0627 \u0628\u0635\u0631\u064A\u0629 \u0623\u0648 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0628\u0648\u0627\u0633\u0637\u0629 \u0642\u0627\u0631\u0626 \u0627\u0644\u0634\u0627\u0634\u0629.'
              : 'Primary fields do not expose clear visual or assistive labels for screen reader users.',
          severity: 'HIGH',
          category: categoryValue,
          subcategory: subcategoryValue,
          pageUrl: 'https://example.com/login',
          recommendation:
            locale === 'ar'
              ? '\u0623\u0636\u0641 \u062A\u0633\u0645\u064A\u0627\u062A \u0635\u0631\u064A\u062D\u0629 \u0648\u0623\u0648\u0635\u0627\u0641 aria-label \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0643\u0644 \u062D\u0642\u0644.'
              : 'Add explicit field labels and matching aria-label attributes for each input.',
          rowDataJson: { auditOutcome: 'FAIL' },
          media: [
            {
              id: 'sample-image-1',
              mediaType: 'IMAGE',
              signedUrl: sampleImage,
              fileAsset: {
                filename: locale === 'ar' ? '\u062F\u0644\u064A\u0644-\u0628\u0635\u0631\u064A-\u0639\u064A\u0646\u0629.png' : 'sample-evidence.png',
              },
            },
          ],
        },
      ],
      locale,
      direction,
    };
  }

  private async buildProjectReportPreviewData(reportId: string, user: UserWithRoles) {
    const accessibleReport = await this.ensureProjectReportAccess(reportId, user);
    const report = await this.prisma.projectReport.findFirst({
      where: {
        id: accessibleReport.id,
        deletedAt: null,
        orgId: user.orgId,
        project: ScopeUtils.projectScope(user),
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
        client: {
          select: { id: true, name: true, logo: true },
        },
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
        entries: {
          where: { deletedAt: null },
          include: {
            media: {
              include: {
                fileAsset: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!report) throw new NotFoundException('Project report not found');

    const clientLogoUrl = await this.resolveClientLogoUrl(report.client?.logo);

    const entries = await Promise.all(
      report.entries.map(async (entry) => ({
        ...entry,
        media: await Promise.all(
          entry.media.map(async (media) => ({
            ...media,
            signedUrl: await this.storage.getSignedUrl(media.fileAsset.storageKey, 3600, false),
          })),
        ),
      })),
    );

    return {
      report: {
        ...report,
        client: report.client
          ? {
              ...report.client,
              logo: clientLogoUrl || null,
            }
          : report.client,
      },
      entries,
    };
  }

  private renderReportHtml(previewData: { report: any; entries: any[]; locale?: 'ar' | 'en'; direction?: 'rtl' | 'ltr' }) {
    const { report, entries } = previewData;
    const localeConfig =
      previewData.locale && previewData.direction
        ? { locale: previewData.locale, direction: previewData.direction }
        : this.getTemplateLocale(report?.templateVersion);
    const labels = this.getPreviewLabels(localeConfig.locale);
    const summary = (report.summaryJson || {}) as Record<string, unknown>;
    const isRtl = localeConfig.direction === 'rtl';
    const reportTitle = this.normalizeDisplayText(report?.title) || labels.coverTag;
    const clientName = this.normalizeDisplayText(report?.client?.name) || labels.client;
    const projectName = this.normalizeDisplayText(report?.project?.name) || labels.project;
    const auditorName = this.normalizeDisplayText(report?.performedBy?.name || labels.performedBy);
    const logoUrl = typeof report?.client?.logo === 'string' ? report.client.logo : '';
    const reportDate = this.formatReportDate(report.publishedAt || report.updatedAt || report.createdAt, localeConfig.locale);
    const introductionBody =
      this.normalizeDisplayText(summary.introduction) ||
      this.normalizeDisplayText(report.description) ||
      labels.sampleDescription;
    const statisticsNarrative = this.normalizeDisplayText(summary.statisticsSummary || summary.executiveSummary);
    const strengthsNarrative = this.normalizeDisplayText((summary as any).strengthsSummary);
    const complianceNarrative = this.normalizeDisplayText((summary as any).complianceSummary);
    const auditMetrics = this.getAuditMetrics(entries);
    const issueEntries = entries.filter((entry) => {
      const outcome = this.getAuditOutcome(entry.rowDataJson);
      return outcome === 'FAIL' || outcome === 'PARTIAL';
    });
    const passEntries = entries.filter((entry) => this.getAuditOutcome(entry.rowDataJson) === 'PASS');
    const recommendationBullets = this.buildRecommendationBullets(summary.recommendationsSummary, issueEntries, localeConfig.locale);
    const scopeServices = Array.from(
      new Set(entries.map((entry) => this.normalizeDisplayText(entry.serviceName)).filter(Boolean)),
    );
    const scopePages = entries.filter((entry) => entry.pageUrl).length;
    const scopeServicesText = scopeServices.length
      ? scopeServices.slice(0, 6).join(localeConfig.locale === 'ar' ? '\u060C ' : ', ')
      : localeConfig.locale === 'ar'
        ? '\u0644\u0645 \u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062f \u062e\u062f\u0645\u0627\u062a \u0628\u0639\u062f'
        : 'No services listed yet';

    const severityCounts = [
      { label: labels.compliancePercentage, count: `${auditMetrics.compliancePercentage}%`, tone: 'total' },
      {
        label: labels.workingChecks,
        count: auditMetrics.pass,
        tone: 'low',
      },
      {
        label: labels.needsAttention,
        count: auditMetrics.fail,
        tone: 'high',
      },
      {
        label: labels.partiallyWorking,
        count: auditMetrics.partial,
        tone: 'medium',
      },
      {
        label: labels.notTested,
        count: auditMetrics.notTested,
        tone: 'total',
      },
    ];

    const categoryCounts = Array.from(
      entries.reduce((map, entry) => {
        const key = entry.category || 'Uncategorized';
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .map(([name, count]) => ({
        key: name,
        label: this.getAccessibilityCategoryDisplay(name, localeConfig.locale),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const strengthsRows = passEntries.length
      ? passEntries
          .slice(0, 8)
          .map((entry) => {
            const serviceName = this.normalizeDisplayText(entry.serviceName);
            const issueTitle = this.normalizeDisplayText(entry.issueTitle);
            return `
              <div class="bar-list-item">
                <div class="bar-list-head">
                  <span>${this.escapeHtml(issueTitle || '-') }</span>
                  <strong>${this.escapeHtml(serviceName || labels.serviceName)}</strong>
                </div>
              </div>
            `;
          })
          .join('')
      : `<div class="empty-block">${this.escapeHtml(localeConfig.locale === 'ar' ? 'لم يتم تسجيل بنود ناجحة بعد.' : 'No working checks recorded yet.')}</div>`;

    const schemaVersion = report.templateVersion;
    const serviceHeader = this.getSchemaLabel(schemaVersion, 'serviceName', localeConfig.locale, labels.serviceName);
    const issueTitleHeader = this.getSchemaLabel(schemaVersion, 'issueTitle', localeConfig.locale, labels.issueTitle);
    const outcomeHeader = labels.outcome;
    const severityHeader = this.getSchemaLabel(schemaVersion, 'severity', localeConfig.locale, labels.severity);
    const categoryHeader = this.getSchemaLabel(schemaVersion, 'category', localeConfig.locale, labels.category);
    const subcategoryHeader = this.getSchemaLabel(schemaVersion, 'subcategory', localeConfig.locale, labels.subcategory);
    const pageUrlHeader = this.getSchemaLabel(schemaVersion, 'pageUrl', localeConfig.locale, labels.pageUrl);
    const evidenceHeader = this.getSchemaLabel(schemaVersion, 'evidence', localeConfig.locale, labels.media);
    const coverDescription =
      this.escapeHtml(this.normalizeDisplayText(report.description)) || this.escapeHtml(labels.sampleDescription);

    const severityCards = severityCounts
      .map(
        (item) => `
          <article class="metric-card metric-card--${item.tone}">
            <div class="metric-value">${item.count}</div>
            <div class="metric-label">${this.escapeHtml(item.label)}</div>
          </article>
        `,
      )
      .join('');

    const categoryRows = categoryCounts.length
      ? categoryCounts
          .map((item) => {
            const width = entries.length ? Math.max(8, Math.round((item.count / entries.length) * 100)) : 0;
            return `
              <div class="bar-list-item">
                <div class="bar-list-head">
                  <span>${this.escapeHtml(item.label || item.key)}</span>
                  <strong>${item.count}</strong>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${width}%"></div>
                </div>
              </div>
            `;
          })
          .join('')
      : `<div class="empty-block">${this.escapeHtml(labels.noEntries)}</div>`;

    const tableRows = entries.length
      ? entries
          .map((entry, index) => {
            const mediaItems = Array.isArray(entry.media) ? entry.media : [];
            const mediaHtml = mediaItems.length
              ? mediaItems
                  .map((media: any) => {
                    const actionLabel =
                      media.mediaType === 'IMAGE'
                        ? labels.viewImage
                        : media.mediaType === 'VIDEO'
                          ? labels.viewVideo
                          : labels.viewEvidence;
                    return `<a class="pill-button pill-button--ghost" href="${this.escapeHtml(media.signedUrl)}" target="_blank" rel="noreferrer">${this.escapeHtml(actionLabel)}</a>`;
                  })
                  .join('<div class="stack-gap"></div>')
              : '<span class="muted">-</span>';

            const pageUrlHtml = entry.pageUrl
              ? `<a class="inline-link" href="${this.escapeHtml(entry.pageUrl)}" target="_blank" rel="noreferrer">${this.escapeHtml(labels.clickHere)}</a>`
              : '<span class="muted">-</span>';

            const serviceName = this.normalizeDisplayText(entry.serviceName);
            const issueTitle = this.normalizeDisplayText(entry.issueTitle);
            const issueDescription = this.normalizeDisplayText(entry.issueDescription);
            const category = this.normalizeDisplayText(entry.category);
            const subcategory = this.normalizeDisplayText(entry.subcategory);
            const severityClass = (entry.severity || 'LOW').toLowerCase() === 'critical' ? 'high' : (entry.severity || 'LOW').toLowerCase();
            const auditOutcome = this.getAuditOutcome(entry.rowDataJson);
            const severityHtml = entry.severity
              ? `<span class="severity-pill severity-pill--${severityClass}">${this.escapeHtml(this.severityLabel(entry.severity, localeConfig.locale))}</span>`
              : '<span class="muted">-</span>';
            const outcomeHtml = `<span class="severity-pill severity-pill--${auditOutcome === 'PASS' ? 'low' : auditOutcome === 'PARTIAL' ? 'medium' : auditOutcome === 'FAIL' ? 'high' : 'neutral'}">${this.escapeHtml(this.getAuditOutcomeLabel(auditOutcome, localeConfig.locale))}</span>`;

            return `
              <tr>
                <td>${index + 1}</td>
                <td>${this.escapeHtml(serviceName) || '<span class="muted">-</span>'}</td>
                <td>
                  <div class="issue-title">${this.escapeHtml(issueTitle) || '-'}</div>
                  ${issueDescription ? `<div class="cell-note">${this.escapeHtml(issueDescription)}</div>` : ''}
                </td>
                <td>${outcomeHtml}</td>
                <td>${severityHtml}</td>
                <td>${this.escapeHtml(category) || '<span class="muted">-</span>'}</td>
                <td>${this.escapeHtml(subcategory) || '<span class="muted">-</span>'}</td>
                <td>${pageUrlHtml}</td>
                <td><div class="media-stack">${mediaHtml}</div></td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="9" class="empty-table">${this.escapeHtml(labels.noEntries)}</td></tr>`;

    const recommendationCards = recommendationBullets
      .map(
        (item, index) => `
          <article class="recommendation-card">
            <div class="recommendation-index">${String(index + 1).padStart(2, '0')}</div>
            <div class="recommendation-copy">${this.escapeHtml(item)}</div>
          </article>
        `,
      )
      .join('');

    const pageHeader = `
      <div class="report-chrome">
        <div class="report-chrome__title">${this.escapeHtml(reportTitle)}</div>
        <div class="report-chrome__meta">${this.escapeHtml(reportDate)}</div>
      </div>
    `;

    return `
      <!doctype html>
      <html lang="${localeConfig.locale}" dir="${localeConfig.direction}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${this.escapeHtml(reportTitle)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          :root {
            --primary: #1E88E5;
            --accent: #00ACC1;
            --background: #F8FAFC;
            --surface: #FFFFFF;
            --surface-alt: #F4F7FB;
            --text-primary: #1A1A1A;
            --text-secondary: #6B7280;
            --border-soft: #E5EDF5;
            --shadow-soft: 0 10px 24px rgba(15, 23, 42, 0.08);
            --radius-lg: 12px;
            --severity-high: #E53935;
            --severity-high-bg: rgba(229, 57, 53, 0.12);
            --severity-medium: #FB8C00;
            --severity-medium-bg: rgba(251, 140, 0, 0.14);
            --severity-low: #43A047;
            --severity-low-bg: rgba(67, 160, 71, 0.14);
          }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: var(--background); color: var(--text-primary); }
          body { font-family: 'Cairo', sans-serif; font-weight: 400; }
          @page { size: A4 landscape; margin: 0; }
          .document { background: var(--background); }
          .page {
            width: 100%;
            height: 210mm;
            padding: 24px;
            background: var(--background);
            page-break-after: always;
            overflow: hidden;
          }
          .page:last-child { page-break-after: auto; }
          .page-shell {
            height: 100%;
            border-radius: 28px;
            background: var(--surface);
            box-shadow: var(--shadow-soft);
            overflow: hidden;
            position: relative;
            display: flex;
            flex-direction: column;
          }
          .page-shell--cover,
          .page-shell--closing {
            background: linear-gradient(135deg, #0F4C81 0%, #1E88E5 52%, #00ACC1 100%);
            color: #FFFFFF;
          }
          .page-shell__body {
            padding: 28px 32px 32px;
            flex: 1;
            min-height: 0;
          }
          .page-shell--cover .page-shell__body,
          .page-shell--closing .page-shell__body {
            min-height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .report-chrome {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 40px;
            background: linear-gradient(90deg, rgba(30,136,229,0.12), rgba(0,172,193,0.08));
            border-bottom: 1px solid rgba(30, 41, 59, 0.06);
            font-size: 13px;
          }
          .report-chrome__title { font-weight: 700; color: var(--text-primary); }
          .report-chrome__meta { color: var(--text-secondary); }
          .page-shell--cover .report-chrome,
          .page-shell--closing .report-chrome {
            background: rgba(255,255,255,0.08);
            border-bottom-color: rgba(255,255,255,0.14);
          }
          .page-shell--cover .report-chrome__title,
          .page-shell--cover .report-chrome__meta,
          .page-shell--closing .report-chrome__title,
          .page-shell--closing .report-chrome__meta {
            color: #FFFFFF;
          }
          .eyebrow {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 12px;
          }
          .page-shell--cover .eyebrow,
          .page-shell--closing .eyebrow { color: rgba(255,255,255,0.78); }
          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 36px; font-weight: 700; line-height: 1.2; }
          h2 { font-size: 22px; font-weight: 700; line-height: 1.25; }
          h3 { font-size: 16px; font-weight: 700; line-height: 1.35; }
          p { font-size: 13px; line-height: 1.9; color: var(--text-secondary); }
          .grid-12 {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            gap: 20px;
            align-items: start;
          }
          .span-5 { grid-column: span 5; }
          .span-7 { grid-column: span 7; }
          .card {
            background: var(--surface);
            border: 1px solid var(--border-soft);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-soft);
            padding: 24px;
          }
          .card--soft { background: var(--surface-alt); }
          .cover-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
          }
          .brand-logo {
            max-width: 180px;
            max-height: 72px;
            object-fit: contain;
            border-radius: 14px;
            background: rgba(255,255,255,0.96);
            padding: 10px 14px;
          }
          .cover-hero {
            padding-top: 28px;
            max-width: 70%;
          }
          .cover-line {
            width: 120px;
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0.28));
            margin: 18px 0 24px;
          }
          .cover-summary {
            max-width: 760px;
            font-size: 14px;
            line-height: 1.9;
            color: rgba(255,255,255,0.88);
          }
          .cover-meta {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
          }
          .meta-card {
            padding: 18px;
            border-radius: var(--radius-lg);
            border: 1px solid rgba(255,255,255,0.16);
            background: rgba(255,255,255,0.08);
          }
          .meta-label {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.68);
            margin-bottom: 8px;
          }
          .meta-value {
            font-size: 16px;
            font-weight: 700;
            color: #FFFFFF;
          }
          .section-stack > * + * { margin-top: 24px; }
          .intro-layout {
            display: grid;
            grid-template-columns: minmax(0, 1.45fr) minmax(260px, 1fr);
            gap: 20px;
            align-items: start;
          }
          .intro-side {
            display: grid;
            gap: 16px;
          }
          .intro-card {
            min-height: 0;
            padding: 20px;
          }
          .intro-copy {
            white-space: pre-wrap;
            font-size: 13px;
            line-height: 1.9;
            color: var(--text-secondary);
          }
          .split-copy { columns: 2; column-gap: 24px; }
          .split-copy p { break-inside: avoid; }
          .metric-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .metric-card {
            padding: 24px;
            border-radius: var(--radius-lg);
            background: var(--surface);
            border: 1px solid var(--border-soft);
            box-shadow: var(--shadow-soft);
            min-height: 118px;
          }
          .metric-card--total { background: linear-gradient(180deg, #E9F4FF 0%, #FFFFFF 100%); }
          .metric-card--high { background: linear-gradient(180deg, #FFF1F0 0%, #FFFFFF 100%); }
          .metric-card--medium { background: linear-gradient(180deg, #FFF7E8 0%, #FFFFFF 100%); }
          .metric-card--low { background: linear-gradient(180deg, #EFFAF1 0%, #FFFFFF 100%); }
          .metric-value { font-size: 36px; font-weight: 700; line-height: 1; margin-bottom: 10px; color: var(--text-primary); }
          .metric-label { font-size: 13px; color: var(--text-secondary); }
          .bar-list-item + .bar-list-item { margin-top: 16px; }
          .bar-list-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-size: 13px;
            color: var(--text-primary);
            margin-bottom: 8px;
          }
          .bar-track {
            width: 100%;
            height: 10px;
            border-radius: 999px;
            background: #E9EEF5;
            overflow: hidden;
          }
          .bar-fill {
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, var(--primary), var(--accent));
          }
          .pill-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 16px;
          }
          .tag-pill {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 999px;
            background: #E9F4FF;
            color: var(--primary);
            font-size: 12px;
            font-weight: 700;
          }
          .table-wrap {
            margin-top: 24px;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid var(--border-soft);
            background: #FFFFFF;
            box-shadow: var(--shadow-soft);
          }
          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            table-layout: fixed;
            font-size: 12px;
          }
          thead { display: table-header-group; }
          thead th {
            position: sticky;
            top: 0;
            background: linear-gradient(90deg, rgba(30,136,229,0.96), rgba(0,172,193,0.92));
            color: #FFFFFF;
            font-size: 12px;
            font-weight: 700;
            text-align: ${isRtl ? 'right' : 'left'};
            padding: 16px 14px;
          }
          tbody tr { page-break-inside: avoid; }
          tbody tr:nth-child(odd) td { background: #FBFCFE; }
          tbody td {
            padding: 14px;
            vertical-align: top;
            color: var(--text-primary);
            border-bottom: 1px solid #EDF2F7;
            word-break: break-word;
          }
          tbody tr:last-child td { border-bottom: none; }
          .issue-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-primary);
            line-height: 1.6;
          }
          .cell-note {
            margin-top: 8px;
            color: var(--text-secondary);
            line-height: 1.7;
          }
          .severity-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 700;
            min-width: 76px;
          }
          .severity-pill--critical,
          .severity-pill--high {
            background: var(--severity-high-bg);
            color: var(--severity-high);
          }
          .severity-pill--medium {
            background: var(--severity-medium-bg);
            color: var(--severity-medium);
          }
          .severity-pill--low {
            background: var(--severity-low-bg);
            color: var(--severity-low);
          }
          .severity-pill--neutral {
            background: rgba(100, 116, 139, 0.14);
            color: #475569;
          }
          .inline-link {
            color: var(--primary);
            text-decoration: none;
            font-weight: 700;
          }
          .pill-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 32px;
            padding: 6px 12px;
            border-radius: 999px;
            text-decoration: none;
            font-size: 12px;
            font-weight: 700;
          }
          .pill-button--ghost {
            background: rgba(30, 136, 229, 0.1);
            color: var(--primary);
            border: 1px solid rgba(30, 136, 229, 0.18);
          }
          .media-stack { display: flex; flex-direction: column; gap: 8px; }
          .stack-gap { height: 0; }
          .recommendation-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
            margin-top: 24px;
          }
          .recommendation-card {
            display: flex;
            gap: 16px;
            align-items: flex-start;
            padding: 20px;
            border-radius: var(--radius-lg);
            background: var(--surface-alt);
            border: 1px solid var(--border-soft);
            box-shadow: var(--shadow-soft);
          }
          .recommendation-index {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            color: #FFFFFF;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
          }
          .recommendation-copy {
            font-size: 13px;
            line-height: 1.8;
            color: var(--text-primary);
          }
          .empty-block,
          .empty-table {
            color: var(--text-secondary);
            text-align: center;
            padding: 24px;
          }
          .muted { color: var(--text-secondary); }
          .narrative { white-space: pre-wrap; }
          .footer-note {
            margin-top: 18px;
            font-size: 11px;
            color: var(--text-secondary);
          }
          .closing-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            gap: 18px;
            min-height: calc(210mm - 200px);
          }
          .closing-mark {
            width: 132px;
            height: 132px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.18);
            color: #FFFFFF;
            font-size: 30px;
            font-weight: 700;
            letter-spacing: 0.04em;
          }
          .closing-copy,
          .cover-footnote { color: rgba(255,255,255,0.86); }
          .closing-tagline {
            font-size: 14px;
            font-weight: 600;
            color: rgba(255,255,255,0.92);
          }
        </style>
      </head>
      <body>
        <div class="document">
          <section class="page">
            <div class="page-shell page-shell--cover">
              ${pageHeader}
              <div class="page-shell__body">
                <div>
                  <div class="cover-top">
                    <div class="cover-hero">
                      <div class="eyebrow">${this.escapeHtml(labels.coverTag)}</div>
                      <h1>${this.escapeHtml(reportTitle)}</h1>
                      <div class="cover-line"></div>
                      <p class="cover-summary">${coverDescription}</p>
                    </div>
                    ${logoUrl ? `<img class="brand-logo" src="${this.escapeHtml(logoUrl)}" alt="${this.escapeHtml(clientName)}" />` : ''}
                  </div>
                </div>
                <div class="cover-meta">
                  <div class="meta-card">
                    <div class="meta-label">${this.escapeHtml(labels.client)}</div>
                    <div class="meta-value">${this.escapeHtml(clientName)}</div>
                  </div>
                  <div class="meta-card">
                    <div class="meta-label">${this.escapeHtml(labels.project)}</div>
                    <div class="meta-value">${this.escapeHtml(projectName)}</div>
                  </div>
                  <div class="meta-card">
                    <div class="meta-label">${this.escapeHtml(labels.reportDate)}</div>
                    <div class="meta-value">${this.escapeHtml(reportDate)}</div>
                  </div>
                  <div class="meta-card">
                    <div class="meta-label">${this.escapeHtml(labels.createdBy)}</div>
                    <div class="meta-value">${this.escapeHtml(auditorName)}</div>
                  </div>
                </div>
                <div class="cover-footnote">${this.escapeHtml(labels.generatedWith)}</div>
              </div>
            </div>
          </section>

          <section class="page">
            <div class="page-shell">
              ${pageHeader}
              <div class="page-shell__body section-stack">
                <div>
                  <div class="eyebrow">${this.escapeHtml(labels.introduction)}</div>
                  <h2>${this.escapeHtml(labels.introduction)}</h2>
                </div>
                <div class="intro-layout">
                  <div class="card intro-card">
                    <p class="intro-copy narrative">${this.escapeHtml(introductionBody).replace(/\n/g, '<br />')}</p>
                  </div>
                  <div class="intro-side">
                    <div class="card card--soft intro-card">
                      <h3>${this.escapeHtml(labels.scopeTitle)}</h3>
                      <p style="margin-top:12px;">${this.escapeHtml(labels.scopeBody)}</p>
                      <div class="pill-row">
                        <span class="tag-pill">${this.escapeHtml(scopeServicesText)}</span>
                        <span class="tag-pill">${this.escapeHtml(`${localeConfig.locale === 'ar' ? '\u0639\u062f\u062f \u0627\u0644\u0635\u0641\u062d\u0627\u062a/\u0627\u0644\u0645\u0633\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u0648\u062b\u0642\u0629' : 'Documented pages/routes'}: ${scopePages}`)}</span>
                      </div>
                    </div>
                    <div class="card intro-card">
                      <h3>${this.escapeHtml(labels.methodologyTitle)}</h3>
                      <p style="margin-top:12px;">${this.escapeHtml(labels.methodologyBody)}</p>
                    </div>
                    <div class="card intro-card">
                      <h3>${this.escapeHtml(labels.standardsTitle)}</h3>
                      <p style="margin-top:12px;">${this.escapeHtml(labels.standardsBody)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="page">
            <div class="page-shell">
              ${pageHeader}
              <div class="page-shell__body section-stack">
                <div>
                  <div class="eyebrow">${this.escapeHtml(labels.statisticsTitle)}</div>
                  <h2>${this.escapeHtml(labels.statisticsTitle)}</h2>
                </div>
                <div class="grid-12">
                  <div class="span-7 section-stack">
                    <div class="metric-grid">${severityCards}</div>
                    ${
                      statisticsNarrative || complianceNarrative
                        ? `
                          <div class="card">
                            <h3>${this.escapeHtml(labels.executiveSummary)}</h3>
                            <p class="narrative" style="margin-top:12px;">${this.escapeHtml(statisticsNarrative || complianceNarrative).replace(/\n/g, '<br />')}</p>
                          </div>
                        `
                        : ''
                    }
                  </div>
                  <div class="span-5 section-stack">
                    <div class="card">
                      <h3>${this.escapeHtml(labels.categoryBreakdown)}</h3>
                      <div style="margin-top:20px;">${categoryRows}</div>
                    </div>
                    <div class="card">
                      <h3>${this.escapeHtml(labels.strengthsTitle)}</h3>
                      <p style="margin-top:12px;">${this.escapeHtml(strengthsNarrative || labels.strengthsBody)}</p>
                      <div style="margin-top:20px;">${strengthsRows}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="page">
            <div class="page-shell">
              ${pageHeader}
              <div class="page-shell__body">
                <div class="eyebrow">${this.escapeHtml(labels.findingsTag)}</div>
                <h2>${this.escapeHtml(labels.findingsTitle)}</h2>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style="width:5%">#</th>
                        <th style="width:12%">${this.escapeHtml(serviceHeader)}</th>
                        <th style="width:21%">${this.escapeHtml(issueTitleHeader)}</th>
                        <th style="width:12%">${this.escapeHtml(outcomeHeader)}</th>
                        <th style="width:10%">${this.escapeHtml(severityHeader)}</th>
                        <th style="width:12%">${this.escapeHtml(categoryHeader)}</th>
                        <th style="width:12%">${this.escapeHtml(subcategoryHeader)}</th>
                        <th style="width:10%">${this.escapeHtml(pageUrlHeader)}</th>
                        <th style="width:16%">${this.escapeHtml(evidenceHeader)}</th>
                      </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                  </table>
                </div>
                <div class="footer-note">${this.escapeHtml(labels.footerNote)}</div>
              </div>
            </div>
          </section>

          <section class="page">
            <div class="page-shell">
              ${pageHeader}
              <div class="page-shell__body section-stack">
                <div>
                  <div class="eyebrow">${this.escapeHtml(labels.recommendationSummary)}</div>
                  <h2>${this.escapeHtml(labels.recommendationsTitle)}</h2>
                </div>
                <div class="card">
                  <h3>${this.escapeHtml(labels.needsAttentionTitle)}</h3>
                  <p style="margin-top:12px;">${this.escapeHtml(complianceNarrative || labels.needsAttentionBody)}</p>
                  <div class="pill-row">
                    <span class="tag-pill">${this.escapeHtml(`${labels.needsAttention}: ${auditMetrics.fail}`)}</span>
                    <span class="tag-pill">${this.escapeHtml(`${labels.partiallyWorking}: ${auditMetrics.partial}`)}</span>
                    <span class="tag-pill">${this.escapeHtml(`${labels.notApplicable}: ${auditMetrics.notApplicable}`)}</span>
                  </div>
                </div>
                <div class="recommendation-grid">${recommendationCards}</div>
              </div>
            </div>
          </section>

          <section class="page">
            <div class="page-shell page-shell--closing">
              ${pageHeader}
              <div class="page-shell__body">
                <div class="closing-center">
                  <div class="eyebrow">${this.escapeHtml(labels.closingTag)}</div>
                  <div class="closing-mark">A360</div>
                  <h2>${this.escapeHtml(labels.closingTitle)}</h2>
                  <p class="closing-copy">${this.escapeHtml(labels.closingThanks)}</p>
                  <div class="closing-tagline">${this.escapeHtml(labels.closingBody)}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </body>
      </html>
    `;
  }

  private async renderProjectReportHtml(reportId: string, user: UserWithRoles, localeOverride?: string) {
    const previewData = await this.buildProjectReportPreviewData(reportId, user);
    const localeConfig = this.resolveReportOutputLocale(previewData.report, localeOverride);
    return this.renderReportHtml({
      ...previewData,
      locale: localeConfig.locale,
      direction: localeConfig.direction,
    });
  }

  async getTemplateVersionSamplePreview(orgId: string, templateId: string, versionId: string, localeOverride?: string) {
    const template = await this.ensureTemplateInOrg(templateId, orgId);
    const version = await this.prisma.reportBuilderTemplateVersion.findFirst({
      where: { id: versionId, templateId },
    });
    if (!version) throw new NotFoundException('Tool version not found');

    const samplePreview = this.buildSampleTemplatePreviewData(template, version, localeOverride);
    return { html: this.renderReportHtml(samplePreview) };
  }

  async listTemplates(orgId: string) {
    return this.prisma.reportBuilderTemplate.findMany({
      where: { orgId },
      include: {
        versions: {
          orderBy: [{ versionNumber: 'desc' }],
          take: 5,
        },
        _count: {
          select: { assignments: true, projectReports: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async createTemplate(orgId: string, user: UserWithRoles, dto: CreateReportBuilderTemplateDto) {
    const code = this.normalizeCode(dto.code);
    if (!code) throw new BadRequestException('Template code is required');
    const existing = await this.prisma.reportBuilderTemplate.findFirst({
      where: { orgId, code },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('A template with this code already exists.');
    }
    const template = await this.prisma.reportBuilderTemplate.create({
      data: {
        orgId,
        name: dto.name.trim() || 'Report Template',
        code,
        description: dto.description?.trim(),
        category: dto.category ?? 'OTHER',
        status: dto.status ?? 'DRAFT',
        createdById: user.id,
      },
    });
    await this.logActivity({
      orgId,
      userId: user.id,
      action: 'report-template.created',
      entityType: 'report_template',
      entityId: template.id,
      description: `Report template "${template.name}" created.`,
      metadata: { templateId: template.id, code: template.code, category: template.category },
    });
    return template;
  }

  async updateTemplate(orgId: string, id: string, dto: UpdateReportBuilderTemplateDto, user?: UserWithRoles) {
    const current = await this.ensureTemplateInOrg(id, orgId);
    const nextCode = dto.code != null ? this.normalizeCode(dto.code) : current.code;
    if (!nextCode) throw new BadRequestException('Template code is required');
    if (nextCode !== current.code) {
      const codeConflict = await this.prisma.reportBuilderTemplate.findFirst({
        where: { orgId, code: nextCode, id: { not: id } },
        select: { id: true },
      });
      if (codeConflict) {
        throw new BadRequestException('A template with this code already exists.');
      }
    }
    const template = await this.prisma.reportBuilderTemplate.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        code: nextCode,
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.category != null && { category: dto.category }),
        ...(dto.status != null && { status: dto.status }),
      },
    });
    await this.logActivity({
      orgId,
      userId: user?.id || current.createdById || 'system',
      action: 'report-template.updated',
      entityType: 'report_template',
      entityId: template.id,
      description: `Report template "${template.name}" updated.`,
      metadata: { templateId: template.id, previousStatus: current.status, nextStatus: template.status },
    });
    return template;
  }

  async createTemplateVersion(
    orgId: string,
    templateId: string,
    dto: CreateReportBuilderTemplateVersionDto,
    user?: UserWithRoles,
  ) {
    const template = await this.ensureTemplateInOrg(templateId, orgId);
    const latest = await this.prisma.reportBuilderTemplateVersion.findFirst({
      where: { templateId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const version = await this.prisma.reportBuilderTemplateVersion.create({
      data: {
        templateId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        schemaJson: dto.schemaJson as object,
        pdfConfigJson: dto.pdfConfigJson ? (dto.pdfConfigJson as object) : undefined,
        aiConfigJson: dto.aiConfigJson ? (dto.aiConfigJson as object) : undefined,
        taxonomyJson: dto.taxonomyJson ? (dto.taxonomyJson as object) : undefined,
      },
    });
    await this.logActivity({
      orgId,
      userId: user?.id || template.createdById || 'system',
      action: 'report-template.version-created',
      entityType: 'report_template_version',
      entityId: version.id,
      description: `Version ${version.versionNumber} created for tool "${template.name}".`,
      metadata: { templateId, versionNumber: version.versionNumber },
    });
    return version;
  }

  async publishTemplateVersion(orgId: string, templateId: string, versionId: string, user: UserWithRoles) {
    await this.ensureTemplateInOrg(templateId, orgId);
    const version = await this.prisma.reportBuilderTemplateVersion.findFirst({
      where: { id: versionId, templateId },
    });
    if (!version) throw new NotFoundException('Tool version not found');

    const [, publishedVersion] = await this.prisma.$transaction([
      this.prisma.reportBuilderTemplateVersion.updateMany({
        where: { templateId },
        data: { isPublished: false },
      }),
      this.prisma.reportBuilderTemplateVersion.update({
        where: { id: versionId },
        data: {
          isPublished: true,
          publishedById: user.id,
          publishedAt: new Date(),
        },
      }),
      this.prisma.reportBuilderTemplate.update({
        where: { id: templateId },
        data: { status: 'ACTIVE' },
      }),
    ]);

    await this.logActivity({
      orgId,
      userId: user.id,
      action: 'report-template.version-published',
      entityType: 'report_template_version',
      entityId: versionId,
      description: `Version ${version.versionNumber} published for the accessibility tool.`,
      metadata: { templateId, versionId, versionNumber: version.versionNumber },
    });

    return publishedVersion;
  }

  async listClientAssignments(orgId: string, clientId: string) {
    await this.ensureClientInOrg(clientId, orgId);
    return this.prisma.clientReportTemplateAssignment.findMany({
      where: {
        orgId,
        clientId,
      },
      include: {
        template: true,
        templateVersion: true,
      },
      orderBy: [{ assignedAt: 'desc' }],
    });
  }

  async createClientAssignment(
    orgId: string,
    clientId: string,
    user: UserWithRoles,
    dto: AssignClientReportTemplateDto,
  ) {
    await this.ensureClientInOrg(clientId, orgId);
    await this.ensureTemplateInOrg(dto.templateId, orgId);
    const version = await this.prisma.reportBuilderTemplateVersion.findFirst({
      where: {
        id: dto.templateVersionId,
        templateId: dto.templateId,
        isPublished: true,
      },
    });
    if (!version) throw new NotFoundException('Published tool version not found');

    if (dto.isDefault) {
      await this.prisma.clientReportTemplateAssignment.updateMany({
        where: { orgId, clientId, templateId: dto.templateId },
        data: { isDefault: false },
      });
    }

    const assignment = await this.prisma.clientReportTemplateAssignment.create({
      data: {
        orgId,
        clientId,
        templateId: dto.templateId,
        templateVersionId: dto.templateVersionId,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        assignedById: user.id,
      },
      include: {
        template: true,
        templateVersion: true,
      },
    });
    await this.logActivity({
      orgId,
      userId: user.id,
      action: 'report-template.assigned',
      entityType: 'client_report_template_assignment',
      entityId: assignment.id,
      description: `Accessibility tool "${assignment.template.name}" assigned to client.`,
      metadata: {
        clientId,
        templateId: assignment.templateId,
        templateVersionId: assignment.templateVersionId,
        isDefault: assignment.isDefault,
      },
    });
    return assignment;
  }

  async updateClientAssignment(
    orgId: string,
    assignmentId: string,
    dto: UpdateClientReportTemplateAssignmentDto,
    user?: UserWithRoles,
  ) {
    const assignment = await this.prisma.clientReportTemplateAssignment.findFirst({
      where: { id: assignmentId, orgId },
    });
    if (!assignment) throw new NotFoundException('Client tool assignment not found');

    if (dto.isDefault) {
      await this.prisma.clientReportTemplateAssignment.updateMany({
        where: {
          orgId,
          clientId: assignment.clientId,
          templateId: assignment.templateId,
        },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.clientReportTemplateAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(dto.isDefault != null && { isDefault: dto.isDefault }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
      include: {
        template: true,
        templateVersion: true,
      },
    });
    if (user) {
      await this.logActivity({
        orgId,
        userId: user.id,
        action: 'report-template.assignment-updated',
        entityType: 'client_report_template_assignment',
        entityId: updated.id,
        description: `Client tool assignment updated for "${updated.template.name}".`,
        metadata: { assignmentId: updated.id, isDefault: updated.isDefault, isActive: updated.isActive },
      });
    }
    return updated;
  }

  async listAvailableTemplates(projectId: string, user: UserWithRoles) {
    const project = await this.ensureProjectAccess(projectId, user);
    return this.prisma.clientReportTemplateAssignment.findMany({
      where: {
        orgId: user.orgId,
        clientId: project.clientId,
        isActive: true,
      },
      include: {
        template: true,
        templateVersion: true,
      },
      orderBy: [{ isDefault: 'desc' }, { assignedAt: 'desc' }],
    });
  }

  async listProjectReports(projectId: string, user: UserWithRoles) {
    await this.ensureProjectAccess(projectId, user);
    const isClientUser = this.isClientUser(user.role);
    return this.prisma.projectReport.findMany({
      where: {
        orgId: user.orgId,
        projectId,
        deletedAt: null,
        ...(isClientUser && {
          status: 'PUBLISHED',
          visibility: 'CLIENT',
        }),
      },
      include: {
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { entries: true, exports: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async createProjectReport(projectId: string, user: UserWithRoles, dto: CreateProjectReportDto) {
    const project = await this.ensureProjectAccess(projectId, user);
    const assignment = await this.prisma.clientReportTemplateAssignment.findFirst({
      where: {
        orgId: user.orgId,
        clientId: project.clientId,
        templateId: dto.templateId,
        templateVersionId: dto.templateVersionId,
        isActive: true,
      },
      include: {
        templateVersion: true,
      },
    });
    if (!assignment) {
      throw new ForbiddenException('Tool version is not assigned to this project client');
    }

    const performedById = dto.performedById ?? user.id;
    const performer = await this.prisma.user.findFirst({
      where: { id: performedById, orgId: user.orgId, isActive: true },
      select: { id: true },
    });
    if (!performer) throw new NotFoundException('Selected performer not found');

    const outputLocale = this.normalizePreviewLocale(dto.outputLocale) || this.getTemplateLocale(assignment.templateVersion).locale;

    const report = await this.prisma.projectReport.create({
      data: {
        orgId: user.orgId,
        clientId: project.clientId,
        projectId,
        templateId: dto.templateId,
        templateVersionId: dto.templateVersionId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        outputLocale,
        visibility: dto.visibility ?? 'INTERNAL',
        performedById,
      },
      include: {
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await this.logActivity({
      orgId: user.orgId,
      projectId,
      userId: user.id,
      action: 'project-report.created',
      entityType: 'project_report',
      entityId: report.id,
      description: `Project report "${report.title}" created from tool "${report.template.name}".`,
        metadata: { reportId: report.id, templateVersionId: report.templateVersionId, visibility: report.visibility, outputLocale: report.outputLocale },
      });
    return report;
  }

  async getProjectReport(reportId: string, user: UserWithRoles) {
    return this.ensureProjectReportAccess(reportId, user);
  }

  async updateProjectReport(reportId: string, user: UserWithRoles, dto: UpdateProjectReportDto) {
    const current = await this.ensureProjectReportAccess(reportId, user);
    const canPublish = this.canPublishProjectReports(user);
    if (dto.performedById) {
      const performer = await this.prisma.user.findFirst({
        where: { id: dto.performedById, orgId: user.orgId, isActive: true },
        select: { id: true },
      });
      if (!performer) throw new NotFoundException('Selected performer not found');
    }

    if (dto.status) {
      if (dto.status === 'IN_REVIEW' && current.status !== 'DRAFT' && !canPublish) {
        throw new ForbiddenException('Only PM/Admin can move a submitted report back through the workflow.');
      }

      if (
        ['APPROVED', 'PUBLISHED', 'ARCHIVED'].includes(dto.status) ||
        (dto.status === 'DRAFT' && current.status !== 'DRAFT')
      ) {
        if (!canPublish) {
          throw new ForbiddenException('Only PM/Admin can approve, publish, archive, or reopen submitted reports.');
        }
      }
    }

    const publishedAt = dto.status === 'PUBLISHED' ? new Date() : undefined;
    const outputLocale = dto.outputLocale != null ? this.normalizePreviewLocale(dto.outputLocale) : undefined;

    const report = await this.prisma.projectReport.update({
      where: { id: reportId },
      data: {
        ...(dto.title != null && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(outputLocale && { outputLocale }),
        ...(dto.status != null && { status: dto.status }),
        ...(dto.visibility != null && { visibility: dto.visibility }),
        ...(dto.status === 'PUBLISHED' && { visibility: 'CLIENT' }),
        ...(dto.performedById != null && { performedById: dto.performedById }),
        ...(dto.summaryJson !== undefined && { summaryJson: dto.summaryJson as object }),
        ...(dto.coverSnapshotJson !== undefined && {
          coverSnapshotJson: dto.coverSnapshotJson as object,
        }),
        ...(publishedAt && { publishedAt }),
      },
      include: {
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (report.visibility === 'CLIENT') {
      await this.promoteProjectReportAssetsForClient(report.id, user.orgId, current.projectId);
    }
    await this.logActivity({
      orgId: user.orgId,
      projectId: current.projectId,
      userId: user.id,
      action: dto.status === 'PUBLISHED' ? 'project-report.published' : 'project-report.updated',
      entityType: 'project_report',
      entityId: report.id,
      description:
        dto.status === 'PUBLISHED'
          ? `Project report "${report.title}" published for client access.`
          : `Project report "${report.title}" updated.`,
      metadata: {
        reportId: report.id,
        previousStatus: current.status,
        nextStatus: report.status,
        visibility: report.visibility,
        outputLocale: report.outputLocale,
      },
    });
    return report;
  }

  async listProjectReportEntries(reportId: string, user: UserWithRoles) {
    await this.ensureProjectReportAccess(reportId, user);
    return this.prisma.projectReportEntry.findMany({
      where: {
        orgId: user.orgId,
        projectReportId: reportId,
        deletedAt: null,
      },
      include: {
        media: {
          include: {
            fileAsset: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createProjectReportEntry(
    reportId: string,
    user: UserWithRoles,
    dto: CreateProjectReportEntryDto,
  ) {
    const report = await this.ensureProjectReportAccess(reportId, user);
    this.ensureDraftReportContent(report);
    this.validateAccessibilityEntryInput(report, dto);
    const normalizedCategory =
      report.template?.category === 'ACCESSIBILITY'
        ? this.normalizeAccessibilityCategory(dto.category) || dto.category?.trim()
        : dto.category?.trim();
    const normalizedSubcategory =
      normalizedCategory && report.template?.category === 'ACCESSIBILITY'
        ? this.normalizeAccessibilitySubcategory(normalizedCategory, dto.subcategory) || dto.subcategory?.trim()
        : dto.subcategory?.trim();
    const entry = await this.prisma.projectReportEntry.create({
      data: {
        orgId: user.orgId,
        projectReportId: reportId,
        sortOrder: dto.sortOrder ?? 0,
        serviceName: dto.serviceName?.trim(),
        issueTitle: dto.issueTitle.trim(),
        issueDescription: dto.issueDescription.trim(),
        severity: dto.severity,
        category: normalizedCategory,
        subcategory: normalizedSubcategory,
        pageUrl: dto.pageUrl?.trim(),
        recommendation: dto.recommendation?.trim(),
        status: dto.status ?? 'OPEN',
        rowDataJson: dto.rowDataJson ? (dto.rowDataJson as object) : undefined,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await this.logActivity({
      orgId: user.orgId,
      projectId: report.projectId,
      userId: user.id,
      action: 'project-report.entry-created',
      entityType: 'project_report_entry',
      entityId: entry.id,
      description: `Report entry "${entry.issueTitle}" added to "${report.title}".`,
      metadata: { reportId, severity: entry.severity, category: entry.category },
    });
    return entry;
  }

  async updateProjectReportEntry(
    reportId: string,
    entryId: string,
    user: UserWithRoles,
    dto: UpdateProjectReportEntryDto,
  ) {
    const report = await this.ensureProjectReportAccess(reportId, user);
    this.ensureDraftReportContent(report);
    const entry = await this.prisma.projectReportEntry.findFirst({
      where: {
        id: entryId,
        orgId: user.orgId,
        projectReportId: reportId,
        deletedAt: null,
      },
    });
    if (!entry) throw new NotFoundException('Project report entry not found');
    this.validateAccessibilityEntryInput(report, {
      serviceName: dto.serviceName ?? entry.serviceName,
      issueTitle: dto.issueTitle ?? entry.issueTitle,
      issueDescription: dto.issueDescription ?? entry.issueDescription,
      severity: dto.severity ?? entry.severity,
      category: dto.category ?? entry.category,
      subcategory: dto.subcategory ?? entry.subcategory,
      pageUrl: dto.pageUrl ?? entry.pageUrl,
      recommendation: dto.recommendation ?? entry.recommendation,
      rowDataJson: dto.rowDataJson ?? (entry.rowDataJson as Record<string, unknown> | null),
    });
    const nextCategoryInput = dto.category ?? entry.category;
    const normalizedCategory =
      report.template?.category === 'ACCESSIBILITY'
        ? this.normalizeAccessibilityCategory(nextCategoryInput) || nextCategoryInput?.trim()
        : nextCategoryInput?.trim();
    const nextSubcategoryInput = dto.subcategory ?? entry.subcategory;
    const normalizedSubcategory =
      normalizedCategory && report.template?.category === 'ACCESSIBILITY'
        ? this.normalizeAccessibilitySubcategory(normalizedCategory, nextSubcategoryInput) || nextSubcategoryInput?.trim()
        : nextSubcategoryInput?.trim();
    const nextAuditOutcome = this.getAuditOutcome(
      dto.rowDataJson !== undefined ? (dto.rowDataJson as Record<string, unknown>) : ((entry.rowDataJson as Record<string, unknown> | null) || null),
    );
    const keepsIssueFields = nextAuditOutcome === 'FAIL' || nextAuditOutcome === 'PARTIAL';

    const updated = await this.prisma.projectReportEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.serviceName !== undefined && { serviceName: dto.serviceName?.trim() || null }),
        ...(dto.issueTitle !== undefined && { issueTitle: dto.issueTitle?.trim() || entry.issueTitle }),
        ...(dto.issueDescription !== undefined && {
          issueDescription: dto.issueDescription?.trim() || entry.issueDescription,
        }),
        severity: keepsIssueFields ? (dto.severity ?? entry.severity) : null,
        ...(dto.category !== undefined && { category: normalizedCategory || null }),
        ...(dto.subcategory !== undefined && { subcategory: normalizedSubcategory || null }),
        ...(dto.pageUrl !== undefined && { pageUrl: dto.pageUrl?.trim() || null }),
        recommendation: keepsIssueFields ? (dto.recommendation !== undefined ? dto.recommendation?.trim() || null : entry.recommendation) : null,
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.rowDataJson !== undefined && { rowDataJson: dto.rowDataJson as object }),
        updatedById: user.id,
      },
    });
    await this.logActivity({
      orgId: user.orgId,
      projectId: report.projectId,
      userId: user.id,
      action: 'project-report.entry-updated',
      entityType: 'project_report_entry',
      entityId: updated.id,
      description: `Report entry "${updated.issueTitle}" updated in "${report.title}".`,
      metadata: { reportId, severity: updated.severity, status: updated.status },
    });
    return updated;
  }

  async deleteProjectReportEntry(reportId: string, entryId: string, user: UserWithRoles) {
    const report = await this.ensureProjectReportAccess(reportId, user);
    this.ensureDraftReportContent(report);
    const entry = await this.prisma.projectReportEntry.findFirst({
      where: {
        id: entryId,
        orgId: user.orgId,
        projectReportId: reportId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('Project report entry not found');

    const deleted = await this.prisma.projectReportEntry.update({
      where: { id: entryId },
      data: {
        deletedAt: new Date(),
        updatedById: user.id,
      },
    });
    await this.logActivity({
      orgId: user.orgId,
      projectId: report.projectId,
      userId: user.id,
      action: 'project-report.entry-deleted',
      entityType: 'project_report_entry',
      entityId: deleted.id,
      description: `A report entry was removed from "${report.title}".`,
      metadata: { reportId, entryId: deleted.id },
    });
    return deleted;
  }

  async reorderProjectReportEntries(
    reportId: string,
    user: UserWithRoles,
    dto: ReorderProjectReportEntriesDto,
  ) {
    const report = await this.ensureProjectReportAccess(reportId, user);
    this.ensureDraftReportContent(report);
    if (!dto.items.length) return [];

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.projectReportEntry.updateMany({
          where: {
            id: item.id,
            orgId: user.orgId,
            projectReportId: reportId,
            deletedAt: null,
          },
          data: {
            sortOrder: item.sortOrder,
            updatedById: user.id,
          },
        }),
      ),
    );

    return this.listProjectReportEntries(reportId, user);
  }

  async uploadProjectReportEntryMedia(
    reportId: string,
    entryId: string,
    user: UserWithRoles,
    file: Express.Multer.File,
    caption?: string,
  ) {
    const entry = await this.ensureProjectReportEntryAccess(reportId, entryId, user);
    const report = await this.ensureProjectReportAccess(reportId, user);
    this.ensureDraftReportContent(report);
    const visibility: FileVisibility = report.visibility === 'CLIENT' ? 'CLIENT' : 'INTERNAL';
    const storageKey = this.storage.generateStorageKey(
      user.orgId,
      'PROJECT',
      report.projectId,
      'EVIDENCE',
      this.sanitizeFilename(file.originalname),
    );

    await this.storage.putObject(storageKey, file.buffer, file.mimetype);

    const fileAsset = await this.prisma.fileAsset.create({
      data: {
        orgId: user.orgId,
        scopeType: FileScopeType.PROJECT,
        projectId: report.projectId,
        uploaderId: user.id,
        category: FileCategory.EVIDENCE,
        visibility,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
      },
    });

    const media = await this.prisma.projectReportEntryMedia.create({
      data: {
        entryId,
        fileAssetId: fileAsset.id,
        mediaType: this.detectMediaType(file.mimetype),
        caption: caption?.trim() || null,
        sortOrder: entry.media.length,
      },
      include: {
        fileAsset: true,
      },
    });

    await this.logActivity({
      orgId: user.orgId,
      projectId: report.projectId,
      userId: user.id,
      action: 'project-report.media-uploaded',
      entityType: 'project_report_media',
      entityId: media.id,
      description: `Evidence "${file.originalname}" uploaded to report "${report.title}".`,
      metadata: { reportId, entryId, mediaType: media.mediaType },
    });

    return media;
  }

  async deleteProjectReportEntryMedia(
    reportId: string,
    entryId: string,
    mediaId: string,
    user: UserWithRoles,
  ) {
    const entry = await this.ensureProjectReportEntryAccess(reportId, entryId, user);
    this.ensureDraftReportContent(entry.projectReport);
    const media = await this.prisma.projectReportEntryMedia.findFirst({
      where: {
        id: mediaId,
        entryId,
        entry: {
          projectReportId: reportId,
          orgId: user.orgId,
        },
      },
      include: {
        fileAsset: true,
      },
    });
    if (!media) throw new NotFoundException('Project report media not found');

    await this.storage.deleteObject(media.fileAsset.storageKey);
    await this.prisma.$transaction([
      this.prisma.projectReportEntryMedia.delete({
        where: { id: mediaId },
      }),
      this.prisma.fileAsset.delete({
        where: { id: media.fileAssetId },
      }),
    ]);

    await this.logActivity({
      orgId: user.orgId,
      projectId: entry.projectReport.projectId,
      userId: user.id,
      action: 'project-report.media-deleted',
      entityType: 'project_report_media',
      entityId: media.id,
      description: `Evidence "${media.fileAsset.filename}" removed from project report.`,
      metadata: { reportId, entryId, mediaId },
    });

    return { success: true };
  }

  async getProjectReportPreview(reportId: string, user: UserWithRoles, localeOverride?: string) {
    const html = await this.renderProjectReportHtml(reportId, user, localeOverride);
    return { html };
  }

  async generateProjectReportAiSummary(reportId: string, user: UserWithRoles) {
    const accessibleReport = await this.ensureProjectReportAccess(reportId, user);
    const entryCount = await this.prisma.projectReportEntry.count({
      where: { orgId: user.orgId, projectReportId: reportId, deletedAt: null },
    });
    if (entryCount === 0) {
      throw new BadRequestException('Add at least one report entry before generating AI summary');
    }
    const narratives = await this.aiService.generateProjectReportNarratives(reportId, user.orgId);
    const report = await this.prisma.projectReport.update({
      where: { id: reportId },
      data: {
        summaryJson: narratives,
      },
      include: {
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await this.logActivity({
      orgId: user.orgId,
      projectId: accessibleReport.projectId,
      userId: user.id,
      action: 'project-report.ai-summary-generated',
      entityType: 'project_report',
      entityId: report.id,
      description: `AI summary generated for project report "${report.title}".`,
      metadata: { reportId: report.id, entryCount },
    });
    return { report, narratives };
  }

  async listClientVisibleReports(user: UserWithRoles) {
    return this.prisma.projectReport.findMany({
      where: {
        orgId: user.orgId,
        deletedAt: null,
        visibility: 'CLIENT',
        status: 'PUBLISHED',
        project: ScopeUtils.projectScope(user),
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
        exports: {
          include: { fileAsset: true },
          orderBy: { exportVersion: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async listAccessibleProjectReports(user: UserWithRoles) {
    return this.prisma.projectReport.findMany({
      where: {
        orgId: user.orgId,
        deletedAt: null,
        project: ScopeUtils.projectScope(user),
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        template: true,
        templateVersion: true,
        performedBy: { select: { id: true, name: true, email: true, role: true } },
        exports: {
          include: { fileAsset: true },
          orderBy: { exportVersion: 'desc' },
          take: 1,
        },
        _count: { select: { entries: true, exports: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getLatestProjectReportExportDownload(reportId: string, user: UserWithRoles) {
    const report = await this.ensureProjectReportAccess(reportId, user);
    let latestExport = await this.prisma.projectReportExport.findFirst({
      where: {
        projectReportId: reportId,
        orgId: user.orgId,
        outputLocale: this.normalizePreviewLocale(report.outputLocale) || 'en',
      },
      include: {
        fileAsset: true,
      },
      orderBy: { exportVersion: 'desc' },
    });
    if (!latestExport) {
      latestExport = await this.prisma.projectReportExport.findFirst({
        where: {
          projectReportId: reportId,
          orgId: user.orgId,
        },
        include: {
          fileAsset: true,
        },
        orderBy: { exportVersion: 'desc' },
      });
    }
    if (!latestExport?.fileAsset) throw new NotFoundException('No exported file available');
    return {
      url: await this.storage.getSignedUrl(latestExport.fileAsset.storageKey, 3600, true),
      exportVersion: latestExport.exportVersion,
    };
  }

  async exportProjectReportPdf(reportId: string, user: UserWithRoles, localeOverride?: string) {
    const { report } = await this.buildProjectReportPreviewData(reportId, user);
    const localeConfig = this.resolveReportOutputLocale(report, localeOverride);
    const html = await this.renderProjectReportHtml(reportId, user, localeOverride);
    const browser = await this.launchPdfBrowser();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '12mm',
          right: '12mm',
          bottom: '12mm',
          left: '12mm',
        },
      });

      const localeSuffix = localeConfig.locale === 'ar' ? '-ar' : '-en';
      const pdfFilename = `${this.sanitizeFilename(report.title || 'project-report')}${localeSuffix}.pdf`;
      const storageKey = this.storage.generateStorageKey(
        user.orgId,
        'PROJECT',
        report.projectId,
        'DOCS',
        pdfFilename,
      );
      await this.storage.putObject(storageKey, Buffer.from(pdfBuffer), 'application/pdf');

      const fileAsset = await this.prisma.fileAsset.create({
        data: {
          orgId: user.orgId,
          scopeType: FileScopeType.PROJECT,
          projectId: report.projectId,
          uploaderId: user.id,
          category: FileCategory.DOCS,
          visibility: report.visibility === 'CLIENT' ? 'CLIENT' : 'INTERNAL',
          filename: pdfFilename,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          storageKey,
        },
      });

      const latestExport = await this.prisma.projectReportExport.findFirst({
        where: { projectReportId: reportId, orgId: user.orgId },
        orderBy: { exportVersion: 'desc' },
        select: { exportVersion: true },
      });

      const exportRecord = await this.prisma.projectReportExport.create({
        data: {
          orgId: user.orgId,
          projectReportId: reportId,
          format: 'PDF',
          outputLocale: localeConfig.locale,
          fileAssetId: fileAsset.id,
          exportVersion: (latestExport?.exportVersion ?? 0) + 1,
          generatedById: user.id,
        },
        include: {
          fileAsset: true,
        },
      });

      await this.logActivity({
        orgId: user.orgId,
        projectId: report.projectId,
        userId: user.id,
        action: 'project-report.exported',
        entityType: 'project_report_export',
        entityId: exportRecord.id,
        description: `PDF export v${exportRecord.exportVersion} generated for report "${report.title}".`,
        metadata: { reportId, exportVersion: exportRecord.exportVersion, visibility: report.visibility },
      });

      return {
        export: exportRecord,
        downloadUrl: await this.storage.getSignedUrl(storageKey, 3600, true),
      };
    } finally {
      await browser.close();
    }
  }
}

