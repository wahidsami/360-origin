import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ArrowRight, Download, FileText, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ClientReportTemplateAssignment,
  Permission,
  ProjectReport,
  ProjectReportOutputLocale,
  ProjectReportVisibility,
  Report,
  Role,
} from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { getAccessibilityOutputLocale } from '@/features/accessibility/accessibilityAuditConfig';
import { Badge, Button, GlassCard, Input, Modal } from '../ui/UIComponents';
import { PermissionGate } from '../PermissionGate';

interface ReportsTabProps {
  reports: Report[];
  projectName?: string | null;
  onRefresh?: () => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ onRefresh, projectName }) => {
  const { i18n } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  const isArabic = i18n.language?.startsWith('ar');

  const copy = useMemo(
    () =>
      isArabic
        ? {
            fallbackProject: 'مشروع',
            loadError: 'تعذر تحميل التقارير.',
            assignToolFirst: 'يرجى تعيين قالب تقرير لهذا العميل أولاً.',
            createSuccess: 'تم إنشاء التقرير بنجاح.',
            createError: 'فشل إنشاء التقرير.',
            internalTitle: 'التقارير الداخلية',
            internalSubtitle:
              'أنشئ تقارير إمكانية الوصول على مستوى المشروع، وأضف الملاحظات المنظمة، واستعرض المخرجات النهائية، وصدّر تقرير التدقيق بصيغة PDF.',
            clientTitle: 'التقارير',
            clientSubtitle: 'التقارير المنشورة لهذا المشروع مع التاريخ والتفاصيل الأساسية.',
            newReport: 'تقرير جديد',
            toolTitle: 'قالب التقرير',
            toolDescription:
              'يستخدم هذا المشروع قوالب تقارير معينة. تتحكم نسخة القالب المعينة في إنشاء التقرير، بينما تتولى مساحة العمل الأدلة وملخصات الذكاء الاصطناعي والمعاينة وتصدير PDF.',
            assignedTool: 'أداة معينة',
            reports: 'تقارير',
            assignedToolLabel: 'القالب المعين',
            default: 'افتراضي',
            version: 'الإصدار',
            noAssignedTool: 'لا يوجد قالب تقرير معين لهذا العميل حتى الآن.',
            noScopeNotes: 'لا توجد ملاحظات نطاق بعد.',
            performedBy: 'تم التنفيذ بواسطة',
            unknown: 'غير معروف',
            findings: 'الملاحظات',
            openReport: 'فتح التقرير',
            noReports: 'لا توجد تقارير بعد',
            noReportsHelp:
              'أنشئ أول تقرير لهذا المشروع، ثم أضف الملاحظات والأدلة والمخرجات الجاهزة للتصدير من مساحة عمل واحدة.',
            clientNoReports: 'لا توجد تقارير منشورة بعد',
            clientNoReportsHelp: 'ستظهر تقارير المشروع المنشورة هنا بعد إتاحتها للعميل.',
            createModalTitle: 'إنشاء تقرير',
            assignedToolInput: 'الأداة المعينة',
            selectTool: 'اختر الأداة',
            reportTitle: 'عنوان التقرير',
            visibility: 'مستوى الإتاحة',
            reportLanguage: 'لغة التقرير',
            languageHelp: 'احفظ اللغة التي سيتم بها مراجعة هذا التقرير ونشره وتصديره.',
            internal: 'داخلي',
            client: 'عميل',
            english: 'English',
            arabic: 'العربية',
            scopeNotes: 'ملاحظات النطاق',
            scopePlaceholder: 'نطاق التدقيق أو ملاحظات البيئة أو سياق التسليم',
            createModalHelp: 'تعتمد هذه الشاشة على مسار التقارير الحالي. القوالب المعينة تحدد بنية التقرير وإخراج PDF.',
            cancel: 'إلغاء',
            createReport: 'إنشاء تقرير',
            statusDraft: 'مسودة',
            statusInReview: 'قيد المراجعة',
            statusApproved: 'معتمد',
            statusPublished: 'منشور',
            statusArchived: 'مؤرشف',
            date: 'التاريخ',
            downloadLatest: 'تنزيل آخر نسخة',
            noExport: 'لا يوجد ملف مُصدَّر متاح حتى الآن.',
            downloadFailed: 'تعذر تنزيل آخر نسخة مُصدَّرة.',
            reportTypeLabel: 'تقرير',
          }
        : {
            fallbackProject: 'Project',
            loadError: 'Failed to load reports.',
            assignToolFirst: 'Assign a report template to this client first.',
            createSuccess: 'Report created.',
            createError: 'Failed to create report.',
            internalTitle: 'Internal Reports',
            internalSubtitle:
              'Create project-level accessibility reports, add structured findings, preview the final output, and export the audit PDF.',
            clientTitle: 'Reports',
            clientSubtitle: 'Published reports for this project with date and essential details.',
            newReport: 'New Report',
            toolTitle: 'Report Template',
            toolDescription:
              'This project uses assigned report templates. The selected template version controls report creation, while the workspace handles evidence, AI summaries, preview, and PDF export.',
            assignedTool: 'assigned tool',
            reports: 'reports',
            assignedToolLabel: 'Assigned Template',
            default: 'Default',
            version: 'Version',
            noAssignedTool: 'No report template is assigned to this client yet.',
            noScopeNotes: 'No scope notes added yet.',
            performedBy: 'Performed by',
            unknown: 'Unknown',
            findings: 'Findings',
            openReport: 'Open Report',
            noReports: 'No reports yet',
            noReportsHelp: 'Create the first report for this project, then document findings, evidence, and export-ready output in one workspace.',
            clientNoReports: 'No published reports yet',
            clientNoReportsHelp: 'Published project reports will appear here once they are released to the client.',
            createModalTitle: 'Create Report',
            assignedToolInput: 'Assigned tool',
            selectTool: 'Select tool',
            reportTitle: 'Report title',
            visibility: 'Visibility',
            reportLanguage: 'Report language',
            languageHelp: 'Save the language this report will be reviewed, published, and exported in.',
            internal: 'Internal',
            client: 'Client',
            english: 'English',
            arabic: 'العربية',
            scopeNotes: 'Scope notes',
            scopePlaceholder: 'Audit scope, environment notes, or delivery context',
            createModalHelp: 'This screen uses the current report workflow. The assigned template determines the report structure and PDF output.',
            cancel: 'Cancel',
            createReport: 'Create Report',
            statusDraft: 'DRAFT',
            statusInReview: 'IN REVIEW',
            statusApproved: 'APPROVED',
            statusPublished: 'PUBLISHED',
            statusArchived: 'ARCHIVED',
            date: 'Date',
            downloadLatest: 'Download Latest',
            noExport: 'No exported file is available yet.',
            downloadFailed: 'Failed to download the latest export.',
            reportTypeLabel: 'Report',
          },
    [isArabic],
  );

  const reportStatusLabel = useCallback(
    (status: string) => {
      if (status === 'DRAFT') return copy.statusDraft;
      if (status === 'IN_REVIEW') return copy.statusInReview;
      if (status === 'APPROVED') return copy.statusApproved;
      if (status === 'PUBLISHED') return copy.statusPublished;
      if (status === 'ARCHIVED') return copy.statusArchived;
      return status;
    },
    [copy.statusApproved, copy.statusArchived, copy.statusDraft, copy.statusInReview, copy.statusPublished],
  );

  const [projectReports, setProjectReports] = useState<ProjectReport[]>([]);
  const [assignments, setAssignments] = useState<ClientReportTemplateAssignment[]>([]);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    assignmentId: '',
    title: '',
    description: '',
    visibility: 'INTERNAL' as ProjectReportVisibility,
    outputLocale: (isArabic ? 'ar' : 'en') as ProjectReportOutputLocale,
  });

  const canCreateReports = hasPermission(Permission.CREATE_PROJECT_REPORTS);
  const isClientUser =
    user?.role === Role.CLIENT_OWNER ||
    user?.role === Role.CLIENT_MANAGER ||
    user?.role === Role.CLIENT_MEMBER;

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.isActive),
    [assignments],
  );

  const buildDefaultReportTitle = useCallback(
    () => `${(projectName || copy.fallbackProject).trim()} - ${copy.reportTypeLabel} - ${format(new Date(), 'yyyy-MM-dd')}`,
    [copy.fallbackProject, copy.reportTypeLabel, projectName],
  );

  const formatReportDate = useCallback(
    (value?: string | null) => {
      if (!value) return '-';
      return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(value));
    },
    [isArabic],
  );

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [templateAssignments, reports] = await Promise.all([
        isClientUser
          ? Promise.resolve([] as ClientReportTemplateAssignment[])
          : api.reportBuilderProjects.listAvailableTemplates(projectId),
        api.reportBuilderProjects.listProjectReports(projectId),
      ]);

      setAssignments(templateAssignments);
      setProjectReports(reports);

      if (!draft.assignmentId && templateAssignments.length > 0) {
        const defaultAssignment = templateAssignments.find((assignment) => assignment.isDefault) || templateAssignments[0];
        setDraft((current) => ({
          ...current,
          assignmentId: defaultAssignment.id,
          title: current.title || buildDefaultReportTitle(),
          outputLocale: getAccessibilityOutputLocale(defaultAssignment.templateVersion),
        }));
      }
    } catch (error) {
      console.error(error);
      toast.error(copy.loadError);
    }
  }, [buildDefaultReportTitle, copy.loadError, draft.assignmentId, isClientUser, projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateReport = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!projectId) return;

      const selectedAssignment = activeAssignments.find((assignment) => assignment.id === draft.assignmentId);
      if (!selectedAssignment) {
        toast.error(copy.assignToolFirst);
        return;
      }

      try {
        const report = await api.reportBuilderProjects.createProjectReport(projectId, {
          templateId: selectedAssignment.templateId,
          templateVersionId: selectedAssignment.templateVersionId,
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          visibility: draft.visibility,
          outputLocale: draft.outputLocale,
        });
        toast.success(copy.createSuccess);
        setCreateOpen(false);
        await loadData();
        onRefresh?.();
        navigate(`/app/projects/${projectId}/report-builder/${report.id}`);
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || copy.createError);
      }
    },
    [activeAssignments, copy.assignToolFirst, copy.createError, copy.createSuccess, draft, loadData, navigate, onRefresh, projectId],
  );

  const handleDownloadLatest = useCallback(
    async (reportId: string) => {
      try {
        const result = await api.reportBuilderProjects.getLatestExport(reportId);
        if (result?.url) {
          window.open(result.url, '_blank', 'noopener,noreferrer');
          return;
        }
        toast.error(copy.noExport);
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || copy.downloadFailed);
      }
    },
    [copy.downloadFailed, copy.noExport],
  );

  const renderReportCard = useCallback(
    (report: ProjectReport) => (
      <GlassCard
        key={report.id}
        className="border-cyan-500/20 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  report.status === 'PUBLISHED'
                    ? 'success'
                    : report.status === 'APPROVED'
                      ? 'warning'
                      : report.status === 'ARCHIVED'
                        ? 'neutral'
                        : 'info'
                }
              >
                {reportStatusLabel(report.status)}
              </Badge>
              {!isClientUser && (
                <Badge variant="neutral">{report.visibility === 'CLIENT' ? copy.client : copy.internal}</Badge>
              )}
              <Badge variant="warning">v{report.templateVersion.versionNumber}</Badge>
              <Badge variant="neutral">{(report.outputLocale || 'en').toUpperCase()}</Badge>
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">{report.title}</h4>
              <p className="mt-1 text-sm text-slate-400">{report.description || copy.noScopeNotes}</p>
            </div>
            <div className={`grid gap-1 text-sm text-slate-400 ${isClientUser ? 'md:grid-cols-3 md:gap-4' : ''}`}>
              <p>{copy.date}: {formatReportDate(report.publishedAt || report.updatedAt || report.createdAt)}</p>
              <p>{copy.performedBy}: {report.performedBy?.name || copy.unknown}</p>
              <p>{copy.findings}: {report._count?.entries ?? 0}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => handleDownloadLatest(report.id)}>
              <Download className="mr-2 h-4 w-4" /> {copy.downloadLatest}
            </Button>
            <Button size="sm" onClick={() => navigate(`/app/projects/${projectId}/report-builder/${report.id}`)}>
              {copy.openReport} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </GlassCard>
    ),
    [copy.client, copy.date, copy.downloadLatest, copy.findings, copy.internal, copy.noScopeNotes, copy.openReport, copy.performedBy, copy.unknown, formatReportDate, handleDownloadLatest, isClientUser, navigate, projectId, reportStatusLabel],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-white">{isClientUser ? copy.clientTitle : copy.internalTitle}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {isClientUser ? copy.clientSubtitle : copy.internalSubtitle}
          </p>
        </div>
        {!isClientUser && (
          <PermissionGate permission={Permission.CREATE_PROJECT_REPORTS}>
            <Button variant="secondary" onClick={() => setCreateOpen(true)} disabled={!activeAssignments.length}>
              <Plus className="mr-2 h-4 w-4" /> {copy.newReport}
            </Button>
          </PermissionGate>
        )}
      </div>

      {isClientUser ? (
        <div className="grid grid-cols-1 gap-4">
          {projectReports.map(renderReportCard)}
          {!projectReports.length && (
            <div className="rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 p-8 text-center">
              <h4 className="font-semibold text-slate-200">{copy.clientNoReports}</h4>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy.clientNoReportsHelp}</p>
            </div>
          )}
        </div>
      ) : (
        <GlassCard className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-400" />
                <h4 className="text-lg font-bold text-white">{copy.toolTitle}</h4>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">{copy.toolDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{activeAssignments.length} {copy.assignedTool}</Badge>
              <Badge variant="neutral">{projectReports.length} {copy.reports}</Badge>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.assignedToolLabel}</p>
              <div className="mt-3 space-y-3">
                {activeAssignments.map((assignment) => (
                  <button
                    key={assignment.id}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        assignmentId: assignment.id,
                        title: buildDefaultReportTitle(),
                        outputLocale: getAccessibilityOutputLocale(assignment.templateVersion),
                      }))
                    }
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      draft.assignmentId === assignment.id
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-slate-800 bg-slate-950/40 hover:border-cyan-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-200">{assignment.template.name}</p>
                      {assignment.isDefault && <Badge variant="success">{copy.default}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{copy.version} {assignment.templateVersion.versionNumber}</p>
                  </button>
                ))}
                {!activeAssignments.length && <p className="text-sm text-slate-500">{copy.noAssignedTool}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projectReports.map(renderReportCard)}
              {!projectReports.length && (
                <div className="md:col-span-2 rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 p-8 text-center">
                  <h4 className="font-semibold text-slate-200">{copy.noReports}</h4>
                  <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy.noReportsHelp}</p>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {!isClientUser && (
        <Modal isOpen={isCreateOpen} onClose={() => setCreateOpen(false)} title={copy.createModalTitle}>
          <form onSubmit={handleCreateReport} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">{copy.assignedToolInput}</label>
              <select
                value={draft.assignmentId}
                onChange={(event) => {
                  const nextAssignmentId = event.target.value;
                  const nextAssignment = activeAssignments.find((assignment) => assignment.id === nextAssignmentId);
                  setDraft((current) => ({
                    ...current,
                    assignmentId: nextAssignmentId,
                    title: buildDefaultReportTitle(),
                    outputLocale: nextAssignment ? getAccessibilityOutputLocale(nextAssignment.templateVersion) : current.outputLocale,
                  }));
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white"
                required
              >
                <option value="">{copy.selectTool}</option>
                {activeAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.template.name} / v{assignment.templateVersion.versionNumber}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label={copy.reportTitle}
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">{copy.visibility}</label>
              <select
                value={draft.visibility}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, visibility: event.target.value as ProjectReportVisibility }))
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white"
              >
                <option value="INTERNAL">{copy.internal}</option>
                <option value="CLIENT">{copy.client}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">{copy.reportLanguage}</label>
              <select
                value={draft.outputLocale}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, outputLocale: event.target.value as ProjectReportOutputLocale }))
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white"
              >
                <option value="en">{copy.english}</option>
                <option value="ar">{copy.arabic}</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">{copy.languageHelp}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">{copy.scopeNotes}</label>
              <textarea
                rows={4}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-white outline-none focus:border-cyan-500"
                placeholder={copy.scopePlaceholder}
              />
            </div>
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-slate-400">
              {copy.createModalHelp}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={!canCreateReports || !activeAssignments.length}>
                {copy.createReport}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

