import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CheckCircle2, Eye, FileText, Plus, Sparkles, Users } from 'lucide-react';
import { Badge, Button, GlassCard, Input, Label, Modal, Select, TextArea } from '@/components/ui/UIComponents';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import {
  ACCESSIBILITY_AUDIT_MAIN_CATEGORIES,
  AccessibilityAuditOutputLocale,
  AccessibilityAuditTaxonomySelection,
  buildAccessibilityTaxonomyPayload,
  buildAccessibilityTaxonomySelection,
  countEnabledAccessibilityCategories,
  createDefaultAccessibilityTaxonomySelection,
  getAccessibilityCategoryLabel,
  getAccessibilityOutputLocale,
  getAccessibilitySubcategoryLabel,
} from '@/features/accessibility/accessibilityAuditConfig';
import {
  Client,
  ClientReportTemplateAssignment,
  ReportBuilderTemplate,
  ReportBuilderTemplateCategory,
  ReportBuilderTemplateVersion,
  Role,
} from '@/types';

const ACCESSIBILITY_ENTRY_FIELD_DEFINITIONS = [
  { key: 'serviceName', labelEn: 'Service Name / Module', labelAr: 'اسم الخدمة / الوحدة', type: 'text', required: true },
  { key: 'issueTitle', labelEn: 'Issue Title', labelAr: 'عنوان المشكلة', type: 'text', required: true },
  { key: 'issueDescription', labelEn: 'Issue Description', labelAr: 'وصف المشكلة', type: 'textarea', required: true },
  { key: 'severity', labelEn: 'Severity', labelAr: 'الأهمية', type: 'select', required: true },
  { key: 'category', labelEn: 'Main Category', labelAr: 'التصنيف الرئيسي', type: 'select', required: true },
  { key: 'subcategory', labelEn: 'Subcategory', labelAr: 'التصنيف الفرعي', type: 'dependent_select', required: true },
  { key: 'pageUrl', labelEn: 'Page URL', labelAr: 'رابط الصفحة', type: 'url', required: true },
  { key: 'evidence', labelEn: 'Evidence Media', labelAr: 'الأدلة', type: 'media_upload', required: false },
  { key: 'recommendation', labelEn: 'Remediation Steps', labelAr: 'خطوات المعالجة', type: 'textarea', required: true },
] as const;

const FIXED_ENTRY_FIELDS = ACCESSIBILITY_ENTRY_FIELD_DEFINITIONS.map((field) => field.labelEn);
const TEMPLATE_CATEGORY_LABELS: Record<ReportBuilderTemplateCategory, { en: string; ar: string }> = {
  ACCESSIBILITY: { en: 'Accessibility', ar: 'إمكانية الوصول' },
  SECURITY: { en: 'Security', ar: 'الأمن' },
  QA: { en: 'QA', ar: 'ضمان الجودة' },
  PERFORMANCE: { en: 'Performance', ar: 'الأداء' },
  COMPLIANCE: { en: 'Compliance', ar: 'الامتثال' },
  OTHER: { en: 'Other', ar: 'أخرى' },
};

const TEMPLATE_CATEGORIES: ReportBuilderTemplateCategory[] = ['ACCESSIBILITY', 'SECURITY', 'QA', 'PERFORMANCE', 'COMPLIANCE', 'OTHER'];

const categoryLabel = (category: ReportBuilderTemplateCategory, locale: 'en' | 'ar') =>
  TEMPLATE_CATEGORY_LABELS[category]?.[locale] || category;

const buildAccessibilityVersionPayload = (
  locale: AccessibilityAuditOutputLocale,
  taxonomySelection: AccessibilityAuditTaxonomySelection,
) => ({
  schemaJson: {
    locale: {
      primary: locale,
      secondary: locale === 'en' ? 'ar' : 'en',
      direction: locale === 'ar' ? 'rtl' : 'ltr',
    },
    entryFields: [
      { key: 'serviceName', label: 'Service Name / Module', labelEn: 'Service Name / Module', labelAr: 'اسم الخدمة / الوحدة', type: 'text', required: true },
      { key: 'issueTitle', label: 'Issue Title', labelEn: 'Issue Title', labelAr: 'عنوان المشكلة', type: 'text', required: true },
      { key: 'issueDescription', label: 'Issue Description', labelEn: 'Issue Description', labelAr: 'وصف المشكلة', type: 'textarea', required: true },
      {
        key: 'severity',
        label: 'Severity',
        labelEn: 'Severity',
        labelAr: 'الأهمية',
        type: 'select',
        required: true,
        options: [
          { value: 'HIGH', label: 'High' },
          { value: 'MEDIUM', label: 'Medium' },
          { value: 'LOW', label: 'Low' },
        ],
      },
      { key: 'category', label: 'Main Category', labelEn: 'Main Category', labelAr: 'التصنيف الرئيسي', type: 'select', required: true, source: 'accessibilityCategories' },
      { key: 'subcategory', label: 'Subcategory', labelEn: 'Subcategory', labelAr: 'التصنيف الفرعي', type: 'dependent_select', required: true, dependsOn: 'category', source: 'accessibilitySubcategories' },
      { key: 'pageUrl', label: 'Page URL', labelEn: 'Page URL', labelAr: 'رابط الصفحة', type: 'url', required: true },
      { key: 'evidence', label: 'Evidence Media', labelEn: 'Evidence Media', labelAr: 'الأدلة', type: 'media_upload', multiple: true },
      { key: 'recommendation', label: 'Remediation Steps', labelEn: 'Remediation Steps', labelAr: 'خطوات المعالجة', type: 'textarea', required: true },
    ],
    tableColumns: ['serviceName', 'issueTitle', 'severity', 'category', 'subcategory', 'pageUrl', 'evidence'],
  },
  pdfConfigJson: {
    locale,
    alternateLocale: locale === 'en' ? 'ar' : 'en',
    direction: locale === 'ar' ? 'rtl' : 'ltr',
    page: { size: 'A4', orientation: 'landscape' },
    cover: { showClientLogo: true, showAuditorName: true, showReportDate: true },
    table: { repeatHeader: true, urlLabelEn: 'Click Here', mediaLabelImageEn: 'View Image', mediaLabelVideoEn: 'View Video' },
  },
  aiConfigJson: {
    enabled: true,
    sections: { intro: true, statistics: true, recommendationSummary: true },
    prompts: { introStyle: 'formal_accessibility_audit', recommendationTone: 'practical_and_client_ready' },
  },
  taxonomyJson: buildAccessibilityTaxonomyPayload(taxonomySelection),
});

const sortVersions = (versions: ReportBuilderTemplateVersion[]) => [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
const prettyDate = (value?: string | null, locale = 'en') => (value ? new Date(value).toLocaleString(locale) : locale === 'ar' ? 'غير محدد' : 'Not set');

export const ReportTemplatesAdmin: React.FC = () => {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isArabic = i18n.language === 'ar';
  const uiLocale: AccessibilityAuditOutputLocale = isArabic ? 'ar' : 'en';
  const copy = React.useMemo(() => (isArabic ? {
    pageTitle: 'لوحة الإدارة / قوالب التقارير',
    pageDescription: 'إدارة قوالب التقارير وإصداراتها، ومعاينة شكل التصدير النهائي، وتعيينها للعملاء.',
    users: 'المستخدمون',
    roles: 'الأدوار',
    createTool: 'إنشاء قالب تقرير',
    loadingAdmin: 'جاري تحميل إدارة قوالب التقارير...',
    toolTitle: 'قوالب التقارير',
    toolSummary: 'قوالب التقارير وإصداراتها.',
    assignmentsCount: 'تعيينات',
    noToolYet: 'لا توجد أداة إمكانية وصول بعد. أنشئها لبدء مسار التدقيق.',
    toolDetails: 'تفاصيل الأداة',
    accessibility: 'إمكانية الوصول',
    toolName: 'اسم القالب',
    internalCode: 'الرمز الداخلي',
    internalCodeHelp: 'مفتاح داخلي للقالب.',
    toolDescription: 'وصف القالب',
    saveToolDetails: 'حفظ تفاصيل القالب',
    newVersion: 'إصدار جديد',
    findingFields: 'حقول الملاحظات',
    enabledCategories: 'التصنيفات المفعلة',
    publishedVersions: 'الإصدارات المنشورة',
    clientAssignments: 'تعيينات العملاء',
    versionLibrary: 'مكتبة الإصدارات',
    version: 'الإصدار',
    published: 'منشور',
    draft: 'مسودة',
    created: 'تم الإنشاء',
    publishedAt: 'تم النشر',
    loading: 'جاري التحميل...',
    preview: 'معاينة',
    publish: 'نشر',
    fixedDefinition: 'تعريف الحقول الحالي',
    includedFields: 'حقول السجل المضمنة',
    exportAiBehavior: 'سلوك التصدير والذكاء الاصطناعي',
    exportRule1: 'تصدير PDF أفقي',
    exportRule2: 'صفحة غلاف، مقدمة بالذكاء الاصطناعي، إحصاءات، جدول الملاحظات، ملخص التوصيات، وصفحة ختامية',
    exportRule3: 'يُستخدم الذكاء الاصطناعي للملخصات فقط وليس لمنطق اكتشاف الملاحظة',
    exportRule4: 'تصنيفات وتصنيفات فرعية ثابتة من تعريف المنتج',
    clientAssignment: 'تعيين العميل',
    client: 'العميل',
    selectClient: 'اختر العميل',
    publishedVersion: 'الإصدار المنشور',
    noPublishedVersionYet: 'لا يوجد إصدار منشور بعد',
    selectVersion: 'اختر الإصدار',
    makeDefault: 'تعيين كافتراضي',
    keepActive: 'الإبقاء عليه مفعلاً',
    assignTool: 'تعيين الأداة',
    assignmentsForClient: 'تعيينات العميل',
    selectClientHint: 'اختر عميلاً لعرض التعيينات.',
    active: 'نشط',
    inactive: 'غير نشط',
    default: 'افتراضي',
    assigned: 'تم التعيين',
    disable: 'تعطيل',
    enable: 'تفعيل',
    markDefault: 'تعيين كافتراضي',
    noAssignments: 'لا توجد تعيينات لهذه الأداة لدى العميل المحدد حتى الآن.',
    createToolPrompt: 'أنشئ قالب تقرير لبدء المسار.',
    previewTitle: 'معاينة القالب',
    previewDescription: 'تستخدم هذه المعاينة بيانات تجريبية من إصدار الأداة المحدد حتى يتمكن مسؤولو النظام من مراجعة شكل التصدير النهائي قبل تعيينه للعملاء.',
    createToolTitle: 'إنشاء قالب تقرير',
    toolNameInput: 'اسم الأداة',
    toolCodeInput: 'رمز الأداة',
    toolCategoryInput: 'فئة القالب',
    description: 'الوصف',
    createToolHelp: 'يؤدي هذا إلى إنشاء قالب تقرير جديد. ما زال بإمكانك استخدام بنية التدقيق الحالية للإصدار، لكن القالب نفسه لم يعد محصوراً في فئة واحدة.',
    cancel: 'إلغاء',
    create: 'إنشاء القالب',
    createVersionTitle: 'إنشاء إصدار قالب',
    createVersionHelp: 'يؤدي هذا إلى إنشاء إصدار للقالب المحدد. يمكنك تحديد لغة الإخراج الافتراضية واختيار الفئات والتصنيفات الفرعية عندما يكون القالب من نوع إمكانية الوصول.',
    defaultLanguage: 'لغة المعاينة / التصدير الافتراضية',
    defaultLanguageHelp: 'يمكن للمدققين تبديل لغة المعاينة لاحقاً، لكن هذا يحدد لغة الإخراج الافتراضية لإصدار القالب.',
    englishLtr: 'الإنجليزية / LTR',
    arabicRtl: 'العربية / RTL',
    exportIncludes: 'يتضمن التصدير صفحة غلاف، ومقدمة بالذكاء الاصطناعي، وإحصاءات، وجدول الملاحظات، وملخص التوصيات، وصفحة ختامية.',
    findingsSupport: 'تدعم الملاحظات أدلة الصور/الفيديو، ورابط الصفحة الدقيق، ومستويات الشدة الثابتة HIGH / MEDIUM / LOW.',
    categoryAvailability: 'توفر التصنيفات',
    categoryAvailabilityHelp: 'عطّل الفئات أو التصنيفات الفرعية لإخفائها من هذا الإصدار دون حذفها من المكتبة الرئيسية.',
    includeAll: 'تضمين الكل',
    subcategoriesEnabled: 'تصنيفات فرعية مفعلة',
    failedLoad: 'فشل تحميل إدارة قوالب التقارير.',
    failedLoadAssignments: 'فشل تحميل تعيينات العملاء.',
    createdToolSuccess: 'تم إنشاء قالب التقرير.',
    createdToolError: 'فشل إنشاء أداة إمكانية الوصول.',
    emptyMainCategoryError: 'فعّل تصنيفاً رئيسياً واحداً على الأقل قبل إنشاء الإصدار.',
    emptySubcategoryError: 'يحتاج كل تصنيف رئيسي مفعّل إلى تصنيف فرعي واحد مفعّل على الأقل.',
    draftedVersionSuccess: 'تم إنشاء مسودة الإصدار.',
    draftedVersionError: 'فشل إنشاء إصدار الأداة.',
    publishedVersionSuccess: 'تم نشر إصدار الأداة.',
    publishedVersionError: 'فشل نشر إصدار الأداة.',
    failedSamplePreview: 'فشل تحميل معاينة النموذج المعروضة.',
    updatedToolSuccess: 'تم تحديث تفاصيل القالب.',
    updatedToolError: 'فشل تحديث تفاصيل أداة إمكانية الوصول.',
    assignedToolSuccess: 'تم تعيين القالب للعميل.',
    assignedToolError: 'فشل تعيين أداة إمكانية الوصول.',
    assignmentUpdated: 'تم تحديث التعيين.',
    assignmentUpdateError: 'فشل تحديث التعيين.',
    createVersion: 'إنشاء الإصدار',
    restrictedTitle: 'قوالب التقارير',
    restrictedBody: 'هذه المنطقة متاحة فقط لدور SUPER_ADMIN. يظل نشر الإصدارات وتعيينها للعملاء مركزياً هنا.',
  } : {
    pageTitle: 'Admin / Report Templates',
    pageDescription: 'Manage report templates, publish versions, preview the exported layout, and assign them to clients.',
    users: 'Users',
    roles: 'Roles',
    createTool: 'Create Report Template',
    loadingAdmin: 'Loading report template administration...',
    toolTitle: 'Report Templates',
    toolSummary: 'Report templates and their versions.',
    assignmentsCount: 'assignments',
    noToolYet: 'No report template yet. Create one to start the workflow.',
    toolDetails: 'Tool Details',
    accessibility: 'Accessibility',
    toolName: 'Template Name',
    internalCode: 'Internal Code',
    internalCodeHelp: 'Internal key for the template.',
    toolDescription: 'Template Description',
    saveToolDetails: 'Save Template Details',
    newVersion: 'New Version',
    findingFields: 'Finding Fields',
    enabledCategories: 'Enabled Categories',
    publishedVersions: 'Published Versions',
    clientAssignments: 'Client Assignments',
    versionLibrary: 'Version Library',
    version: 'Version',
    published: 'Published',
    draft: 'Draft',
    created: 'Created',
    publishedAt: 'Published',
    loading: 'Loading...',
    preview: 'Preview',
    publish: 'Publish',
    fixedDefinition: 'Current Field Definition',
    includedFields: 'Included Fields',
    exportAiBehavior: 'Export and AI Behavior',
    exportRule1: 'Landscape PDF export',
    exportRule2: 'Cover page, AI introduction, statistics, findings table, recommendations summary, and closing page',
    exportRule3: 'AI used only for summaries, not for finding logic',
    exportRule4: 'Static categories and subcategories from product definition',
    clientAssignment: 'Client Assignment',
    client: 'Client',
    selectClient: 'Select client',
    publishedVersion: 'Published Version',
    noPublishedVersionYet: 'No published version yet',
    selectVersion: 'Select version',
    makeDefault: 'Make default',
    keepActive: 'Keep active',
    assignTool: 'Assign Tool',
    assignmentsForClient: 'Assignments for Client',
    selectClientHint: 'Select a client to inspect assignments.',
    active: 'Active',
    inactive: 'Inactive',
    default: 'Default',
    assigned: 'Assigned',
    disable: 'Disable',
    enable: 'Enable',
    markDefault: 'Mark Default',
    noAssignments: 'No assignments for this tool on the selected client yet.',
    createToolPrompt: 'Create a report template to begin the workflow.',
    previewTitle: 'Template Preview',
    previewDescription: 'This mock preview uses sample data from the selected tool version so admin users can review the final export layout before client assignment.',
    createToolTitle: 'Create Report Template',
    toolNameInput: 'Tool name',
    toolCodeInput: 'Tool code',
    toolCategoryInput: 'Template category',
    description: 'Description',
    createToolHelp: 'This creates a new report template shell. You can still use the current audit version structure, but the template is no longer locked to one category.',
    cancel: 'Cancel',
    create: 'Create Tool',
    createVersionTitle: 'Create Template Version',
    createVersionHelp: 'This creates a version for the selected template. You can set the default output language and decide which categories and subcategories stay available when the template is Accessibility.',
    defaultLanguage: 'Default Preview / Export Language',
    defaultLanguageHelp: 'Auditors can still switch preview language later, but this controls the default output for the tool version.',
    englishLtr: 'English / LTR',
    arabicRtl: 'Arabic / RTL',
    exportIncludes: 'Export includes cover page, AI introduction, AI statistics, findings table, recommendations summary, and closing page.',
    findingsSupport: 'Findings support image/video evidence, exact page URL, and fixed HIGH / MEDIUM / LOW severity.',
    categoryAvailability: 'Category Availability',
    categoryAvailabilityHelp: 'Disable categories or subcategories to keep them out of this tool version without deleting them from the master library.',
    includeAll: 'Include All',
    subcategoriesEnabled: 'subcategories enabled',
    failedLoad: 'Failed to load report template administration.',
    failedLoadAssignments: 'Failed to load client assignments.',
    createdToolSuccess: 'Report template created.',
    createdToolError: 'Failed to create report template.',
    emptyMainCategoryError: 'Enable at least one main category before creating a tool version.',
    emptySubcategoryError: 'Each enabled main category needs at least one enabled subcategory.',
    draftedVersionSuccess: 'Template version drafted.',
    draftedVersionError: 'Failed to create tool version.',
    publishedVersionSuccess: 'Tool version published.',
    publishedVersionError: 'Failed to publish tool version.',
    failedSamplePreview: 'Failed to load rendered sample preview.',
    updatedToolSuccess: 'Template details updated.',
    updatedToolError: 'Failed to update template details.',
    assignedToolSuccess: 'Template assigned to client.',
    assignedToolError: 'Failed to assign template.',
    assignmentUpdated: 'Assignment updated.',
    assignmentUpdateError: 'Failed to update assignment.',
    createVersion: 'Create Version',
    restrictedTitle: 'Report Templates',
    restrictedBody: 'This area is restricted to SUPER_ADMIN. Version publishing and client assignment stay centralized here.',
  }), [isArabic]);
  const fixedEntryFieldLabels = React.useMemo(() => ACCESSIBILITY_ENTRY_FIELD_DEFINITIONS.map((field) => (isArabic ? field.labelAr : field.labelEn)), [isArabic]);
  const statusLabel = React.useCallback((status: string) => {
    if (!isArabic) return status;
    if (status === 'ACTIVE') return 'نشط';
    if (status === 'ARCHIVED') return 'مؤرشف';
    if (status === 'DRAFT') return 'مسودة';
    return status;
  }, [isArabic]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [templates, setTemplates] = React.useState<ReportBuilderTemplate[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState('');
  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [previewVersionId, setPreviewVersionId] = React.useState('');
  const [clientAssignments, setClientAssignments] = React.useState<ClientReportTemplateAssignment[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = React.useState(false);
  const [versionModalOpen, setVersionModalOpen] = React.useState(false);
  const [samplePreviewOpen, setSamplePreviewOpen] = React.useState(false);
  const [samplePreviewHtml, setSamplePreviewHtml] = React.useState('');
  const [samplePreviewLoadingId, setSamplePreviewLoadingId] = React.useState('');
  const [samplePreviewLocale, setSamplePreviewLocale] = React.useState<AccessibilityAuditOutputLocale>('en');
  const [templateForm, setTemplateForm] = React.useState({
    name: 'Accessibility Audit',
    code: 'accessibility-audit',
    category: 'ACCESSIBILITY' as ReportBuilderTemplateCategory,
    description: 'Fixed report template for project-level reports.',
  });
  const [toolDetailsForm, setToolDetailsForm] = React.useState({
    name: 'Accessibility Audit',
    description: 'Fixed report template for project-level reports.',
  });
  const [versionLocale, setVersionLocale] = React.useState<AccessibilityAuditOutputLocale>('en');
  const [versionTaxonomySelection, setVersionTaxonomySelection] = React.useState<AccessibilityAuditTaxonomySelection>(
    () => createDefaultAccessibilityTaxonomySelection(),
  );
  const [assignmentForm, setAssignmentForm] = React.useState({
    templateVersionId: '',
    isDefault: true,
    isActive: true,
  });

  const selectedTemplate = React.useMemo(() => templates.find((template) => template.id === selectedTemplateId) ?? null, [templates, selectedTemplateId]);
  const sortedVersions = React.useMemo(() => (selectedTemplate ? sortVersions(selectedTemplate.versions) : []), [selectedTemplate]);
  const publishedVersions = React.useMemo(() => sortedVersions.filter((version) => version.isPublished), [sortedVersions]);
  const previewVersion = React.useMemo(() => sortedVersions.find((version) => version.id === previewVersionId) ?? sortedVersions[0] ?? null, [previewVersionId, sortedVersions]);
  const filteredAssignments = React.useMemo(() => clientAssignments.filter((assignment) => (selectedTemplate ? assignment.templateId === selectedTemplate.id : true)), [clientAssignments, selectedTemplate]);
  const activeVersionTaxonomySelection = React.useMemo(
    () => buildAccessibilityTaxonomySelection(previewVersion?.taxonomyJson),
    [previewVersion?.taxonomyJson],
  );

  const loadTemplates = React.useCallback(async (preferredTemplateId?: string) => {
    const data = await api.reportBuilderAdmin.listTemplates();
    setTemplates(data);
    const nextTemplateId = preferredTemplateId && data.some((template) => template.id === preferredTemplateId) ? preferredTemplateId : data[0]?.id ?? '';
    setSelectedTemplateId(nextTemplateId);
    const nextTemplate = data.find((template) => template.id === nextTemplateId);
    const nextVersionId = sortVersions(nextTemplate?.versions ?? [])[0]?.id ?? '';
    const nextPublishedVersionId = sortVersions(nextTemplate?.versions ?? []).find((version) => version.isPublished)?.id ?? '';
    setPreviewVersionId(nextVersionId);
    setAssignmentForm((current) => ({ ...current, templateVersionId: nextPublishedVersionId || current.templateVersionId }));
  }, []);

  const loadAssignments = React.useCallback(async (clientId: string) => {
    if (!clientId) {
      setClientAssignments([]);
      return;
    }
    const assignments = await api.reportBuilderAdmin.listClientAssignments(clientId);
    setClientAssignments(assignments);
  }, []);

  React.useEffect(() => {
    const bootstrap = async () => {
      try {
        const [templateData, clientData] = await Promise.all([api.reportBuilderAdmin.listTemplates(), api.clients.list()]);
        setTemplates(templateData);
        setClients(clientData);
        const firstTemplateId = templateData[0]?.id ?? '';
        const firstVersionId = sortVersions(templateData[0]?.versions ?? [])[0]?.id ?? '';
        const firstPublishedVersionId = sortVersions(templateData[0]?.versions ?? []).find((version) => version.isPublished)?.id ?? '';
        const firstClientId = clientData[0]?.id ?? '';
        setSelectedTemplateId(firstTemplateId);
        setPreviewVersionId(firstVersionId);
        setSelectedClientId(firstClientId);
        setAssignmentForm((current) => ({ ...current, templateVersionId: firstPublishedVersionId }));
        if (firstClientId) {
          const assignments = await api.reportBuilderAdmin.listClientAssignments(firstClientId);
          setClientAssignments(assignments);
        }
      } catch (error) {
        console.error(error);
        toast.error(copy.failedLoad);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  React.useEffect(() => {
    if (!selectedTemplate) return;
    const latestVersionId = sortedVersions[0]?.id ?? '';
    const latestPublishedVersionId = sortedVersions.find((version) => version.isPublished)?.id ?? '';
    setPreviewVersionId((current) => (current && sortedVersions.some((version) => version.id === current) ? current : latestVersionId));
    setAssignmentForm((current) => ({
      ...current,
      templateVersionId: current.templateVersionId && publishedVersions.some((version) => version.id === current.templateVersionId) ? current.templateVersionId : latestPublishedVersionId,
    }));
  }, [publishedVersions, selectedTemplate, sortedVersions]);

  React.useEffect(() => {
    if (!selectedTemplate) return;
    setToolDetailsForm({
      name: selectedTemplate.name,
      description: selectedTemplate.description || '',
    });
  }, [selectedTemplate]);

  React.useEffect(() => {
    const sourceVersion = sortedVersions[0] ?? null;
    setVersionLocale(getAccessibilityOutputLocale(sourceVersion));
    setVersionTaxonomySelection(buildAccessibilityTaxonomySelection(sourceVersion?.taxonomyJson));
    setSamplePreviewLocale(getAccessibilityOutputLocale(previewVersion ?? sourceVersion));
  }, [previewVersion, sortedVersions]);

  React.useEffect(() => {
    loadAssignments(selectedClientId).catch((error) => {
      console.error(error);
      toast.error(copy.failedLoadAssignments);
    });
  }, [loadAssignments, selectedClientId]);

  if (user?.role !== Role.SUPER_ADMIN) {
    return (
      <GlassCard className="max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{copy.restrictedTitle}</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {copy.restrictedBody}
        </p>
      </GlassCard>
    );
  }

  const handleCreateTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await api.reportBuilderAdmin.createTemplate(templateForm);
      await loadTemplates(created.id);
      setTemplateModalOpen(false);
      toast.success(copy.createdToolSuccess);
    } catch (error) {
      console.error(error);
      toast.error(copy.createdToolError);
    }
  };

  const handleCreateVersion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTemplate) return;
    const taxonomyPayload = buildAccessibilityTaxonomyPayload(versionTaxonomySelection);
    if (taxonomyPayload.accessibilityCategories.length === 0) {
      toast.error(copy.emptyMainCategoryError);
      return;
    }

    const hasEmptyCategory = taxonomyPayload.accessibilityCategories.some(
      (category) => (taxonomyPayload.accessibilitySubcategories[category.value] || []).length === 0,
    );

    if (hasEmptyCategory) {
      toast.error(copy.emptySubcategoryError);
      return;
    }

    try {
      await api.reportBuilderAdmin.createTemplateVersion(
        selectedTemplate.id,
        buildAccessibilityVersionPayload(versionLocale, versionTaxonomySelection),
      );
      await loadTemplates(selectedTemplate.id);
      setVersionModalOpen(false);
      toast.success(copy.draftedVersionSuccess);
    } catch (error) {
      console.error(error);
      toast.error(copy.draftedVersionError);
    }
  };

  const handlePublishVersion = async (versionId: string) => {
    if (!selectedTemplate) return;
    try {
      await api.reportBuilderAdmin.publishTemplateVersion(selectedTemplate.id, versionId);
      await loadTemplates(selectedTemplate.id);
      toast.success(copy.publishedVersionSuccess);
    } catch (error) {
      console.error(error);
      toast.error(copy.publishedVersionError);
    }
  };

  const handleOpenSamplePreview = async (versionId: string, locale: AccessibilityAuditOutputLocale = samplePreviewLocale) => {
    if (!selectedTemplate) return;
    setSamplePreviewLoadingId(versionId);
    try {
      const html = await api.reportBuilderAdmin.getTemplateVersionSamplePreview(
        selectedTemplate.id,
        versionId,
        locale,
      );
      setSamplePreviewLocale(locale);
      setPreviewVersionId(versionId);
      setSamplePreviewHtml(html);
      setSamplePreviewOpen(true);
    } catch (error) {
      console.error(error);
      toast.error(copy.failedSamplePreview);
    } finally {
      setSamplePreviewLoadingId('');
    }
  };

  const handleUpdateToolDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTemplate) return;

    try {
      await api.reportBuilderAdmin.updateTemplate(selectedTemplate.id, {
        name: toolDetailsForm.name.trim(),
        description: toolDetailsForm.description.trim(),
        code: selectedTemplate.code,
        category: selectedTemplate.category,
      });
      await loadTemplates(selectedTemplate.id);
      toast.success(copy.updatedToolSuccess);
    } catch (error) {
      console.error(error);
      toast.error(copy.updatedToolError);
    }
  };

  const toggleCategorySelection = (category: string, enabled: boolean) => {
    setVersionTaxonomySelection((current) => {
      const next = { ...current };
      next[category] = Object.fromEntries(
        Object.keys(current[category] || {}).map((subcategory) => [subcategory, enabled]),
      );
      return next;
    });
  };

  const toggleSubcategorySelection = (category: string, subcategory: string, enabled: boolean) => {
    setVersionTaxonomySelection((current) => ({
      ...current,
      [category]: {
        ...(current[category] || {}),
        [subcategory]: enabled,
      },
    }));
  };

  const handleAssignTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTemplate || !selectedClientId || !assignmentForm.templateVersionId) return;
    try {
      await api.reportBuilderAdmin.createClientAssignment(selectedClientId, {
        templateId: selectedTemplate.id,
        templateVersionId: assignmentForm.templateVersionId,
        isDefault: assignmentForm.isDefault,
        isActive: assignmentForm.isActive,
      });
      await loadAssignments(selectedClientId);
      toast.success(copy.assignedToolSuccess);
    } catch (error) {
      console.error(error);
      toast.error(copy.assignedToolError);
    }
  };

  const handleToggleAssignment = async (assignment: ClientReportTemplateAssignment, payload: { isDefault?: boolean; isActive?: boolean }) => {
    try {
      await api.reportBuilderAdmin.updateClientAssignment(assignment.id, payload);
      await loadAssignments(selectedClientId);
      toast.success(copy.assignmentUpdated);
    } catch (error) {
      console.error(error);
      toast.error(copy.assignmentUpdateError);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{copy.pageTitle}</h1>
          <p className="text-slate-600 dark:text-slate-400">
            {copy.pageDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NavLink to="/app/admin/users"><Button variant="outline" size="sm">{copy.users}</Button></NavLink>
          <NavLink to="/app/admin/roles"><Button variant="outline" size="sm">{copy.roles}</Button></NavLink>
          {templates.length === 0 && (
            <Button size="sm" onClick={() => setTemplateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {copy.createTool}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <GlassCard>
          <p className="text-sm text-slate-600 dark:text-slate-400">{copy.loadingAdmin}</p>
        </GlassCard>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <GlassCard className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.toolTitle}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{copy.toolSummary}</p>
            </div>
            <div className="space-y-3">
              {templates.map((template) => {
                const isSelected = template.id === selectedTemplateId;
                const latestVersion = sortVersions(template.versions)[0];
                return (
                  <button key={template.id} type="button" onClick={() => setSelectedTemplateId(template.id)} className={`w-full rounded-2xl border p-4 text-left transition-all ${isSelected ? 'border-cyan-400/60 bg-cyan-50 dark:bg-cyan-500/10' : 'border-slate-200 bg-white hover:border-cyan-300/50 dark:border-slate-800 dark:bg-slate-900/70'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{template.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{template.code}</p>
                      </div>
                      <Badge variant={template.status === 'ACTIVE' ? 'success' : template.status === 'ARCHIVED' ? 'warning' : 'neutral'}>{statusLabel(template.status)}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge variant="info">{categoryLabel(template.category, uiLocale)}</Badge>
                      <Badge variant="neutral">v{latestVersion?.versionNumber ?? 0}</Badge>
                      <Badge variant="neutral">{template._count?.assignments ?? 0} {copy.assignmentsCount}</Badge>
                    </div>
                  </button>
                );
              })}
              {templates.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {copy.noToolYet}
                </div>
              )}
            </div>
          </GlassCard>

          <div className="space-y-6">
            {selectedTemplate ? (
              <>
                <GlassCard>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <form className="flex-1 space-y-4" onSubmit={handleUpdateToolDetails}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{copy.toolDetails}</h2>
                        <Badge variant={selectedTemplate.status === 'ACTIVE' ? 'success' : selectedTemplate.status === 'ARCHIVED' ? 'warning' : 'neutral'}>{statusLabel(selectedTemplate.status)}</Badge>
                        <Badge variant="info">{categoryLabel(selectedTemplate.category, uiLocale)}</Badge>
                      </div>
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                        <Input
                          label={copy.toolName}
                          value={toolDetailsForm.name}
                          onChange={(event) => setToolDetailsForm((current) => ({ ...current, name: event.target.value }))}
                          required
                        />
                        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.internalCode}</p>
                          <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedTemplate.code}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.internalCodeHelp}</p>
                        </div>
                      </div>
                      <TextArea
                        label={copy.toolDescription}
                        value={toolDetailsForm.description}
                        onChange={(event) => setToolDetailsForm((current) => ({ ...current, description: event.target.value }))}
                      />
                      <div className="flex justify-end">
                        <Button type="submit" variant="outline">{copy.saveToolDetails}</Button>
                      </div>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setVersionModalOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> {copy.newVersion}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.findingFields}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{fixedEntryFieldLabels.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.enabledCategories}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{countEnabledAccessibilityCategories(activeVersionTaxonomySelection)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.publishedVersions}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{publishedVersions.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.clientAssignments}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{selectedTemplate._count?.assignments ?? 0}</p>
                    </div>
                  </div>
                </GlassCard>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
                  <div className="space-y-6">
                    <GlassCard>
                      <div className="mb-4 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-cyan-500" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.versionLibrary}</h3>
                      </div>
                      <div className="space-y-4">
                        {sortedVersions.map((version) => (
                          <div key={version.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.version} {version.versionNumber}</h4>
                                  <Badge variant={version.isPublished ? 'success' : 'neutral'}>{version.isPublished ? copy.published : copy.draft}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.created} {prettyDate(version.createdAt, uiLocale)} / {copy.publishedAt} {prettyDate(version.publishedAt, uiLocale)}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenSamplePreview(version.id, samplePreviewLocale)} disabled={samplePreviewLoadingId === version.id}>
                                  <Eye className="mr-2 h-4 w-4" /> {samplePreviewLoadingId === version.id ? copy.loading : copy.preview}
                                </Button>
                                {!version.isPublished && (
                                  <Button size="sm" onClick={() => handlePublishVersion(version.id)}>
                                    {copy.publish}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassCard>

                    <GlassCard>
                      <div className="mb-4 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-cyan-500" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.fixedDefinition}</h3>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{copy.includedFields}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {fixedEntryFieldLabels.map((field) => <Badge key={field} variant="info">{field}</Badge>)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                            <Sparkles className="h-4 w-4 text-cyan-500" /> {copy.exportAiBehavior}
                          </div>
                          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                            <li>{copy.exportRule1}</li>
                            <li>{copy.exportRule2}</li>
                            <li>{copy.exportRule3}</li>
                            <li>{copy.exportRule4}</li>
                          </ul>
                        </div>
                      </div>
                    </GlassCard>
                  </div>

                  <div className="space-y-6">
                    <GlassCard>
                      <div className="mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-cyan-500" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.clientAssignment}</h3>
                      </div>
                      <form className="space-y-4" onSubmit={handleAssignTemplate}>
                        <div>
                          <Label>{copy.client}</Label>
                          <Select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                            <option value="">{copy.selectClient}</option>
                            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label>{copy.publishedVersion}</Label>
                          <Select value={assignmentForm.templateVersionId} disabled={publishedVersions.length === 0} onChange={(event) => setAssignmentForm((current) => ({ ...current, templateVersionId: event.target.value }))}>
                            <option value="">{publishedVersions.length === 0 ? copy.noPublishedVersionYet : copy.selectVersion}</option>
                            {publishedVersions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber} ({copy.published})</option>)}
                          </Select>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
                            <input type="checkbox" checked={assignmentForm.isDefault} onChange={(event) => setAssignmentForm((current) => ({ ...current, isDefault: event.target.checked }))} />
                            {copy.makeDefault}
                          </label>
                          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
                            <input type="checkbox" checked={assignmentForm.isActive} onChange={(event) => setAssignmentForm((current) => ({ ...current, isActive: event.target.checked }))} />
                            {copy.keepActive}
                          </label>
                        </div>
                        <Button type="submit" className="w-full" disabled={!selectedClientId || !assignmentForm.templateVersionId}>{copy.assignTool}</Button>
                      </form>
                    </GlassCard>

                    <GlassCard>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.assignmentsForClient}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{clients.find((client) => client.id === selectedClientId)?.name || copy.selectClientHint}</p>
                      </div>
                      <div className="space-y-3">
                        {filteredAssignments.map((assignment) => (
                          <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-slate-900 dark:text-white">{assignment.template.name} / v{assignment.templateVersion.versionNumber}</p>
                              <Badge variant={assignment.isActive ? 'success' : 'warning'}>{assignment.isActive ? copy.active : copy.inactive}</Badge>
                              {assignment.isDefault && <Badge variant="info">{copy.default}</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.assigned} {prettyDate(assignment.assignedAt, uiLocale)}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleToggleAssignment(assignment, { isActive: !assignment.isActive })}>{assignment.isActive ? copy.disable : copy.enable}</Button>
                              {!assignment.isDefault && <Button type="button" variant="outline" size="sm" onClick={() => handleToggleAssignment(assignment, { isDefault: true })}>{copy.markDefault}</Button>}
                            </div>
                          </div>
                        ))}
                        {selectedClientId && filteredAssignments.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{copy.noAssignments}</p>}
                      </div>
                    </GlassCard>
                  </div>
                </div>
              </>
            ) : (
              <GlassCard>
                <p className="text-sm text-slate-600 dark:text-slate-400">{copy.createToolPrompt}</p>
              </GlassCard>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={samplePreviewOpen} onClose={() => setSamplePreviewOpen(false)} title={copy.previewTitle} maxWidth="max-w-6xl">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {copy.previewDescription}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={samplePreviewLocale === 'en' ? 'primary' : 'outline'}
                onClick={() => {
                  setSamplePreviewLocale('en');
                  if (previewVersion) {
                    handleOpenSamplePreview(previewVersion.id, 'en');
                  }
                }}
              >
                English
              </Button>
              <Button
                type="button"
                size="sm"
                variant={samplePreviewLocale === 'ar' ? 'primary' : 'outline'}
                onClick={() => {
                  setSamplePreviewLocale('ar');
                  if (previewVersion) {
                    handleOpenSamplePreview(previewVersion.id, 'ar');
                  }
                }}
              >
                العربية
              </Button>
            </div>
          </div>
          <iframe title={copy.previewTitle} className="min-h-[70vh] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800" srcDoc={samplePreviewHtml} />
        </div>
      </Modal>

      <Modal isOpen={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={copy.createToolTitle} maxWidth="max-w-2xl">
        <form className="space-y-4" onSubmit={handleCreateTemplate}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={copy.toolNameInput} value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Accessibility Audit" required />
            <Input label={copy.toolCodeInput} value={templateForm.code} onChange={(event) => setTemplateForm((current) => ({ ...current, code: event.target.value }))} placeholder="accessibility-audit" required />
          </div>
          <div>
            <Label>{copy.toolCategoryInput}</Label>
            <Select
              value={templateForm.category}
              onChange={(event) => setTemplateForm((current) => ({ ...current, category: event.target.value as ReportBuilderTemplateCategory }))}
            >
              {TEMPLATE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{categoryLabel(category, uiLocale)}</option>
              ))}
            </Select>
          </div>
          <TextArea label={copy.description} value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            {copy.createToolHelp}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTemplateModalOpen(false)}>{copy.cancel}</Button>
            <Button type="submit">{copy.create}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={versionModalOpen} onClose={() => setVersionModalOpen(false)} title={copy.createVersionTitle} maxWidth="max-w-3xl">
        <form className="space-y-4" onSubmit={handleCreateVersion}>
          <div className="rounded-2xl border border-cyan-200/60 bg-cyan-50 p-4 text-sm text-slate-700 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-slate-300">
            {copy.createVersionHelp}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{copy.includedFields}</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {fixedEntryFieldLabels.map((field) => <Badge key={field} variant="info">{field}</Badge>)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <Label>{copy.defaultLanguage}</Label>
              <Select value={versionLocale} onChange={(event) => setVersionLocale(event.target.value as AccessibilityAuditOutputLocale)}>
                <option value="en">{copy.englishLtr}</option>
                <option value="ar">{copy.arabicRtl}</option>
              </Select>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {copy.defaultLanguageHelp}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {copy.exportIncludes}
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {copy.findingsSupport}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{copy.categoryAvailability}</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {copy.categoryAvailabilityHelp}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setVersionTaxonomySelection(createDefaultAccessibilityTaxonomySelection())}>
                  {copy.includeAll}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {ACCESSIBILITY_AUDIT_MAIN_CATEGORIES.map((category) => {
                const categorySelection = versionTaxonomySelection[category] || {};
                const enabledCount = Object.values(categorySelection).filter(Boolean).length;
                const categoryEnabled = enabledCount > 0;

                return (
                  <div key={getAccessibilityCategoryLabel(category, uiLocale)} className={`rounded-2xl border p-4 ${categoryEnabled ? 'border-cyan-400/30 bg-cyan-500/5' : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40'}`}>
                    <label className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{getAccessibilityCategoryLabel(category, uiLocale)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{enabledCount} {copy.subcategoriesEnabled}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={categoryEnabled}
                        onChange={(event) => toggleCategorySelection(category, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>

                    <div className="mt-3 grid gap-2">
                      {Object.keys(categorySelection).map((subcategory) => (
                        <label key={getAccessibilitySubcategoryLabel(category as any, subcategory, uiLocale)} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${categorySelection[subcategory] ? 'border-cyan-400/30 bg-cyan-500/5 text-slate-800 dark:text-slate-100' : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'}`}>
                          <input
                            type="checkbox"
                            checked={categorySelection[subcategory]}
                            onChange={(event) => toggleSubcategorySelection(category, subcategory, event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span>{getAccessibilitySubcategoryLabel(category as any, subcategory, uiLocale)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setVersionModalOpen(false)}>{copy.cancel}</Button>
            <Button type="submit">{copy.createVersion}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ReportTemplatesAdmin;
