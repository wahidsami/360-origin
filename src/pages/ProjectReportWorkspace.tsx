import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Check, Download, Eye, FileImage, FileText, Pencil, Plus, Search, Send, Sparkles, Trash2, Upload, Video, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, GlassCard, Input, Modal, Select, TextArea } from '@/components/ui/UIComponents';
import { useAuth } from '@/contexts/AuthContext';
import { useAppDialog } from '@/contexts/DialogContext';
import { api } from '@/services/api';
import { navigateBack } from '@/utils/navigation';
import {
  ACCESSIBILITY_AUDIT_MAIN_CATEGORIES,
  AccessibilityAuditMainCategory,
  AccessibilityAuditOutputLocale,
  getAccessibilityCategoryLabel,
  getAccessibilityOutputLocale,
  getAccessibilitySubcategoryLabel,
  resolveAccessibilityTaxonomy,
} from '@/features/accessibility/accessibilityAuditConfig';
import { Permission, ProjectReport, ProjectReportEntry, ProjectReportEntryMedia, ProjectReportEntryOutcome, ProjectReportEntrySeverity, ProjectReportEntryStatus, ProjectReportOutputLocale, ReportBuilderTemplateVersion, Role, isInternalRole } from '@/types';

const SEVERITIES: ProjectReportEntrySeverity[] = ['HIGH', 'MEDIUM', 'LOW'];
const DEFAULT_ENTRY_STATUS: ProjectReportEntryStatus = 'OPEN';
const AUDIT_OUTCOMES: ProjectReportEntryOutcome[] = ['PASS', 'FAIL', 'PARTIAL', 'NOT_APPLICABLE', 'NOT_TESTED'];
const EVIDENCE_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const EVIDENCE_UPLOAD_LIMIT_MB = 50;

type EvidenceUploadSlot = 'image' | 'video';
type EvidenceUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error';

interface ApprovalInfo {
  id: string;
  status: string;
  entityType: string;
  entityId: string;
  stepOrder?: number;
  approver?: { id: string; name: string };
  requestedBy?: { name: string };
  reviewedBy?: { name: string };
  reviewedAt?: string;
  comment?: string | null;
}

const emptyEntryDraft = {
  serviceName: '',
  issueTitle: '',
  issueDescription: '',
  auditOutcome: 'FAIL' as ProjectReportEntryOutcome,
  severity: 'MEDIUM' as ProjectReportEntrySeverity,
  category: '' as AccessibilityAuditMainCategory | '',
  subcategory: '',
  pageUrl: '',
  recommendation: '',
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  if (/^([a-z0-9-]+\.)+[a-z]{2,}([/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

const severityBadgeVariant: Record<ProjectReportEntrySeverity, 'danger' | 'warning' | 'success'> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
  CRITICAL: 'danger',
};

const severityCopy: Record<ProjectReportEntrySeverity, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  CRITICAL: 'Critical',
};

const mediaActionLabel = (media: ProjectReportEntryMedia) => {
  if (media.mediaType === 'IMAGE') return 'View Image';
  if (media.mediaType === 'VIDEO') return 'View Video';
  return 'View Evidence';
};

const outcomeVariant: Record<ProjectReportEntryOutcome, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  PASS: 'success',
  FAIL: 'danger',
  PARTIAL: 'warning',
  NOT_APPLICABLE: 'info',
  NOT_TESTED: 'neutral',
};

const getAuditOutcome = (entry?: Pick<ProjectReportEntry, 'auditOutcome' | 'rowDataJson'> | null): ProjectReportEntryOutcome => {
  const candidate = entry?.auditOutcome ?? entry?.rowDataJson?.auditOutcome;
  if (candidate === 'PASS' || candidate === 'FAIL' || candidate === 'PARTIAL' || candidate === 'NOT_APPLICABLE' || candidate === 'NOT_TESTED') {
    return candidate;
  }
  return 'FAIL';
};

const getVersionTaxonomy = (version?: ReportBuilderTemplateVersion | null) => resolveAccessibilityTaxonomy(version?.taxonomyJson);

const CP1252_REVERSE_MAP: Record<number, number> = {
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

const MOJIBAKE_MARKER_REGEX = /[ØÙÚÛ]|[\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/;

const cp1252CharToByte = (char: string): number | null => {
  const codePoint = char.codePointAt(0);
  if (typeof codePoint !== 'number') return null;
  if (codePoint <= 0xff) return codePoint;
  if (codePoint in CP1252_REVERSE_MAP) return CP1252_REVERSE_MAP[codePoint];
  return null;
};

const decodeMojibakeString = (value: string): string => {
  if (!MOJIBAKE_MARKER_REGEX.test(value)) return value;

  try {
    const bytes: number[] = [];
    for (const char of Array.from(value)) {
      const byte = cp1252CharToByte(char);
      if (byte === null) return value;
      bytes.push(byte);
    }

    const decoded = new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
    if (/[\u0600-\u06ff]/.test(decoded)) return decoded;
  } catch {
    // no-op: keep original string
  }

  return value;
};

const toText = (value: unknown): string => {
  if (typeof value === 'string') return decodeMojibakeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const normalizeCategoryValue = (value: unknown): AccessibilityAuditMainCategory | '' => {
  if (
    typeof value === 'string' &&
    ACCESSIBILITY_AUDIT_MAIN_CATEGORIES.includes(value as AccessibilityAuditMainCategory)
  ) {
    return value as AccessibilityAuditMainCategory;
  }
  return '';
};

const normalizeWorkspaceEntry = (entry: ProjectReportEntry): ProjectReportEntry => ({
  ...entry,
  serviceName: toText(entry.serviceName),
  issueTitle: toText(entry.issueTitle),
  issueDescription: toText(entry.issueDescription),
  category: normalizeCategoryValue(entry.category),
  subcategory: toText(entry.subcategory),
  pageUrl: toText(entry.pageUrl),
  recommendation: toText(entry.recommendation),
});

const toDisplayText = (value: unknown): string => {
  if (typeof value === 'string') return decodeMojibakeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toDisplayText(item)).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') {
      return decodeMojibakeString(record.text);
    }
    return Object.entries(record)
      .map(([key, nested]) => {
        const nestedText = toDisplayText(nested);
        return nestedText ? `${key}: ${nestedText}` : key;
      })
      .join('\n');
  }
  return '';
};

const decodeMojibakeRecord = <T extends Record<string, string>>(record: T): T => {
  const fixed = {} as T;
  (Object.keys(record) as Array<keyof T>).forEach((key) => {
    fixed[key] = decodeMojibakeString(record[key]) as T[keyof T];
  });
  return fixed;
};

export const ProjectReportWorkspace: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { projectId, reportId } = useParams();
  const { user, hasPermission } = useAuth();
  const { confirm } = useAppDialog();

  const isArabic = i18n.language === 'ar';
  const uiLocale: AccessibilityAuditOutputLocale = isArabic ? 'ar' : 'en';
  const copy = React.useMemo(() => {
      const localizedCopy = isArabic
        ? {
            loadingReport: 'Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ ØªÙ‚Ø±ÙŠØ± Ø¥Ù…ÙƒØ§Ù†ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„...',
            reportNotFound: 'ØªØ¹Ø°Ø± Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ ØªÙ‚Ø±ÙŠØ± Ø¥Ù…ÙƒØ§Ù†ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„.',
            reportVersion: 'Ø¥ØµØ¯Ø§Ø± Ø§Ù„Ø£Ø¯Ø§Ø©',
            performedBy: 'ØªÙ… Ø§Ù„ØªÙ†ÙÙŠØ° Ø¨ÙˆØ§Ø³Ø·Ø©',
            unknown: 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
            clientReadOnly: 'ÙˆØµÙˆÙ„ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø·. ØªØ¸Ù‡Ø± Ù‡Ù†Ø§ ÙÙ‚Ø· ØªÙ‚Ø§Ø±ÙŠØ± Ø¥Ù…ÙƒØ§Ù†ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„ Ø§Ù„Ù…Ù†Ø´ÙˆØ±Ø© ÙˆØ§Ù„Ù…Ø±Ø¦ÙŠØ© Ù„Ù„Ø¹Ù…ÙŠÙ„.',
            loadingPreview: 'Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø©...',
            previewReport: 'Ù…Ø¹Ø§ÙŠÙ†Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±',
            downloadLatestExport: 'ØªÙ†Ø²ÙŠÙ„ Ø¢Ø®Ø± Ù†Ø³Ø®Ø©',
            addFinding: 'Ø¥Ø¶Ø§ÙØ© Ù†ØªÙŠØ¬Ø© ØªØ¯Ù‚ÙŠÙ‚',
            totalFindings: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù†ØªØ§Ø¦Ø¬',
            complianceScore: 'Ù†Ø³Ø¨Ø© Ø§Ù„Ø§Ù…ØªØ«Ø§Ù„',
            workingChecks: 'Ù…Ø§ ÙŠØ¹Ù…Ù„ Ø¨Ø´ÙƒÙ„ ØµØ­ÙŠØ­',
            needsAttention: 'ÙŠØ­ØªØ§Ø¬ Ù…Ø¹Ø§Ù„Ø¬Ø©',
            partialChecks: 'ÙŠØ¹Ù…Ù„ Ø¬Ø²Ø¦ÙŠØ§',
            notTested: 'Ù„Ù… ÙŠØªÙ… Ø§Ø®ØªØ¨Ø§Ø±Ù‡',
            high: 'Ø¹Ø§Ù„ÙŠØ©',
            medium: 'Ù…ØªÙˆØ³Ø·Ø©',
            low: 'Ù…Ù†Ø®ÙØ¶Ø©',
            aiReportSummary: 'Ù…Ù„Ø®Øµ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø¨Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ',
            introduction: 'Ø§Ù„Ù…Ù‚Ø¯Ù…Ø©',
            executiveSummary: 'Ø§Ù„Ù…Ù„Ø®Øµ Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ',
            strengthsSummary: 'Ù…Ø§ ÙŠØ¹Ù…Ù„ Ø¨Ø´ÙƒÙ„ Ø¬ÙŠØ¯',
            complianceSummary: 'Ù…Ù„Ø®Øµ Ø§Ù„Ø§Ù…ØªØ«Ø§Ù„',
            recommendationsSummary: 'Ù…Ù„Ø®Øµ Ø§Ù„ØªÙˆØµÙŠØ§Øª',
            findingsList: 'Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª',
            findingsListDescription: 'Ø³Ø¬Ù„ Ø¨Ø³ÙŠØ· Ù„Ù†ØªØ§Ø¦Ø¬ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚ ÙŠÙˆØ¶Ø­ Ù…Ø§ ÙŠØ¹Ù…Ù„ ÙˆÙ…Ø§ ÙŠØ­ØªØ§Ø¬ Ù…Ø¹Ø§Ù„Ø¬Ø©ØŒ Ù…Ø¹ Ø§Ù„Ø­ÙØ§Ø¸ Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© ÙÙŠ Ø§Ù„Ø£Ø¯Ø§Ø©.',
            searchFindings: 'Ø§Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª',
            allSeverities: 'ÙƒÙ„ Ù…Ø³ØªÙˆÙŠØ§Øª Ø§Ù„Ø´Ø¯Ø©',
            allOutcomes: 'ÙƒÙ„ Ø§Ù„Ù†ØªØ§Ø¦Ø¬',
            allCategories: 'ÙƒÙ„ Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª',
            serviceName: 'Ø§Ø³Ù… Ø§Ù„Ø®Ø¯Ù…Ø© / Ø§Ù„ÙˆØ­Ø¯Ø©',
            issueTitle: 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ù…Ø´ÙƒÙ„Ø©',
            outcome: 'Ø§Ù„Ù†ØªÙŠØ¬Ø©',
            severity: 'Ø§Ù„Ø´Ø¯Ø©',
            category: 'Ø§Ù„ØªØµÙ†ÙŠÙ',
            subcategory: 'Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„ÙØ±Ø¹ÙŠ',
            pageUrl: 'Ø±Ø§Ø¨Ø· Ø§Ù„ØµÙØ­Ø©',
            media: 'Ø§Ù„ÙˆØ³Ø§Ø¦Ø·',
            actions: 'Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª',
            clickHere: 'Ø§Ø¶ØºØ· Ù‡Ù†Ø§',
            remove: 'Ø¥Ø²Ø§Ù„Ø©',
            noFindings: 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù„Ø§Ø­Ø¸Ø§Øª ØªØ·Ø§Ø¨Ù‚ Ø¹ÙˆØ§Ù…Ù„ Ø§Ù„ØªØµÙÙŠØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ø¨Ø¹Ø¯.',
            editFinding: 'ØªØ¹Ø¯ÙŠÙ„ Ù†ØªÙŠØ¬Ø© Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚',
            newObservation: 'Ù†ØªÙŠØ¬Ø© ØªØ¯Ù‚ÙŠÙ‚ Ø¬Ø¯ÙŠØ¯Ø©',
            basicInformation: 'Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©',
            auditResult: 'Ù†ØªÙŠØ¬Ø© Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚',
            auditResultHelp: 'Ø§Ø®ØªØ± Ù‡Ù„ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ø²Ø¡ ÙŠØ¹Ù…Ù„ Ø¨Ø´ÙƒÙ„ ØµØ­ÙŠØ­ Ø£Ù… ÙŠØ­ØªØ§Ø¬ Ù…Ø¹Ø§Ù„Ø¬Ø©.',
            outcomePass: 'ÙŠØ¹Ù…Ù„ Ø¨Ø´ÙƒÙ„ ØµØ­ÙŠØ­',
            outcomeFail: 'ÙˆØ¬Ø¯Ù†Ø§ Ù…Ø´ÙƒÙ„Ø©',
            outcomePartial: 'ÙŠØ¹Ù…Ù„ Ø¬Ø²Ø¦ÙŠØ§',
            outcomeNotApplicable: 'ØºÙŠØ± Ù…Ù†Ø·Ø¨Ù‚',
            outcomeNotTested: 'Ù„Ù… ÙŠØªÙ… Ø§Ø®ØªØ¨Ø§Ø±Ù‡',
            servicePlaceholder: 'Ù…Ø«Ø§Ù„: ØªØ¯ÙÙ‚ Ø§Ù„Ø¯ÙØ¹ Ø¹Ø¨Ø± Ø§Ù„Ø¬ÙˆØ§Ù„',
            issueTitlePlaceholder: 'ÙˆØµÙ Ù‚ØµÙŠØ± ÙˆÙˆØ§Ø¶Ø­ Ù„Ù„Ù…Ø´ÙƒÙ„Ø©',
            issueDescription: 'ÙˆØµÙ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©',
            issueDescriptionPlaceholder: 'Ø´Ø±Ø­ ØªÙØµÙŠÙ„ÙŠ Ù„Ø¹Ø§Ø¦Ù‚ Ø¥Ù…ÙƒØ§Ù†ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„...',
            positiveNotePlaceholder: 'Ø§ÙƒØªØ¨ Ø¨Ø¨Ø³Ø§Ø·Ø© Ù…Ø§ Ø§Ù„Ø°ÙŠ ÙŠØ¹Ù…Ù„ Ø¨Ø´ÙƒÙ„ Ø¬ÙŠØ¯ Ù‡Ù†Ø§...',
            severityClassification: 'ØªØµÙ†ÙŠÙ Ø§Ù„Ø´Ø¯Ø©',
            accessibilityCategory: 'ØªØµÙ†ÙŠÙ Ø¥Ù…ÙƒØ§Ù†ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„',
            mainCategory: 'Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ',
            subcategoryLabelOptional: 'Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„ÙØ±Ø¹ÙŠ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)',
            subcategoryHelpOptional: 'ÙŠÙ…ÙƒÙ† ØªØ±Ùƒ Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„ÙØ±Ø¹ÙŠ ÙØ§Ø±ØºÙ‹Ø§ Ø¹Ù†Ø¯Ù…Ø§ ØªÙƒÙˆÙ† Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø¥ÙŠØ¬Ø§Ø¨ÙŠØ© Ø£Ùˆ ØºÙŠØ± Ù…Ù†Ø·Ø¨Ù‚Ø© Ø£Ùˆ ØºÙŠØ± Ù…Ø®ØªØ¨Ø±Ø©.',
            selectCategory: 'Ø§Ø®ØªØ± Ø§Ù„ØªØµÙ†ÙŠÙ',
            selectSubcategory: 'Ø§Ø®ØªØ± Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„ÙØ±Ø¹ÙŠ',
            evidenceMedia: 'ÙˆØ³Ø§Ø¦Ø· Ø§Ù„Ø¥Ø«Ø¨Ø§Øª',
            imageProof: 'Ø¥Ø«Ø¨Ø§Øª Ø¨Ø§Ù„ØµÙˆØ±Ø©',
            videoDemo: 'Ø¹Ø±Ø¶ ÙÙŠØ¯ÙŠÙˆ',
            digitalLocation: 'Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ù„Ø±Ù‚Ù…ÙŠ',
            exactPageUrl: 'Ø±Ø§Ø¨Ø· Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø¯Ù‚ÙŠÙ‚',
            pageUrlPlaceholder: 'https://app.client.com/specific-route',
            developerRecommendations: 'ØªÙˆØµÙŠØ§Øª Ù„ÙØ±ÙŠÙ‚ Ø§Ù„ØªØ·ÙˆÙŠØ±',
            remediationSteps: 'Ø®Ø·ÙˆØ§Øª Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©',
            remediationPlaceholder: 'Ø¥Ø±Ø´Ø§Ø¯Ø§Øª Ù…Ø­Ø¯Ø¯Ø© Ù„ÙØ±ÙŠÙ‚ Ø§Ù„ØªØ·ÙˆÙŠØ± Ù„Ù…Ø¹Ø§Ù„Ø¬Ø© Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©...',
            recommendationOptionalHelp: 'ÙŠÙØ¶Ù„ ÙƒØªØ§Ø¨Ø© Ø®Ø·ÙˆØ§Øª Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø© ÙÙ‚Ø· Ø¹Ù†Ø¯ ÙˆØ¬ÙˆØ¯ Ù…Ø´ÙƒÙ„Ø© Ø£Ùˆ Ø­Ø§Ù„Ø© Ø¬Ø²Ø¦ÙŠØ©.',
            existingEvidence: 'Ø§Ù„Ø£Ø¯Ù„Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©',
            cancel: 'Ø¥Ù„ØºØ§Ø¡',
            updateFinding: 'ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø©',
            commitFinding: 'Ø­ÙØ¸ Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø©',
            reportPreview: 'Ù…Ø¹Ø§ÙŠÙ†Ø© ØªÙ‚Ø±ÙŠØ± Ø¥Ù…ÙƒØ§Ù†ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„',
            previewDescription: 'ØªÙØ¹Ø±Ø¶ Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø© Ù…Ù† Ù…Ø³Ø§Ø± HTML/PDF ÙÙŠ Ø§Ù„Ø®Ù„ÙÙŠØ© ÙˆØªÙØ¸Ù‡Ø± Ø´ÙƒÙ„ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ Ø¨Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙˆØ§Ù„Ø£Ø¯Ù„Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©.',
            english: 'English',
            arabic: 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©',
            printPdf: 'Ø·Ø¨Ø§Ø¹Ø© / Ø­ÙØ¸ PDF',
            statusDraft: 'Ù…Ø³ÙˆØ¯Ø©',
            statusInReview: 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©',
            statusApproved: 'Ù…Ø¹ØªÙ…Ø¯',
            statusPublished: 'Ù…Ù†Ø´ÙˆØ±',
            statusArchived: 'Ù…Ø¤Ø±Ø´Ù',
            submitForReview: 'Ø¥Ø±Ø³Ø§Ù„ Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©',
            approveReport: 'Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ØªÙ‚Ø±ÙŠØ±',
            publishReport: 'Ù†Ø´Ø± Ù„Ù„Ø¹Ù…ÙŠÙ„',
            returnToDraft: 'Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©',
            reportLockedTitle: 'Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ù…Ù‚ÙÙ„Ø© Ø®Ø§Ø±Ø¬ Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø³ÙˆØ¯Ø©',
            reportLockedHelp: 'Ø¨Ø¹Ø¯ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©ØŒ ØªØªÙˆÙ‚Ù ØªØ¹Ø¯ÙŠÙ„Ø§Øª Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙˆØ§Ù„Ø£Ø¯Ù„Ø© Ø­ØªÙ‰ ÙŠØ¹ÙŠØ¯ PM Ø£Ùˆ Admin Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©.',
            statusUpdateSuccess: 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±.',
            statusUpdateError: 'ÙØ´Ù„ ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±.'
          }
        : {
            loadingReport: 'Loading accessibility report...',
            reportNotFound: 'Accessibility report not found.',
            reportVersion: 'Tool version',
            performedBy: 'Performed by',
            unknown: 'Unknown',
            clientReadOnly: 'Client access is read-only. Only published client-visible accessibility reports are available here.',
            loadingPreview: 'Loading Preview...',
            previewReport: 'Preview Report',
            downloadLatestExport: 'Download Latest Export',
            addFinding: 'Add Audit Result',
            totalFindings: 'Total Results',
            complianceScore: 'Compliance Score',
            workingChecks: 'Working',
            needsAttention: 'Needs Attention',
            partialChecks: 'Partially Working',
            notTested: 'Not Tested',
            high: 'High',
            medium: 'Medium',
            low: 'Low',
            aiReportSummary: 'AI Report Summary',
            introduction: 'Introduction',
            executiveSummary: 'Executive Summary',
            strengthsSummary: "What's Working",
            complianceSummary: 'Compliance Summary',
            recommendationsSummary: 'Recommendations Summary',
            findingsList: 'Audit Results',
            findingsListDescription: 'A beginner-friendly audit log that shows what is working, what needs attention, and what still needs testing.',
            searchFindings: 'Search findings',
            allSeverities: 'All severities',
            allOutcomes: 'All results',
            allCategories: 'All categories',
            serviceName: 'Service Name',
            issueTitle: 'Issue Title',
            outcome: 'Result',
            severity: 'Severity',
            category: 'Category',
            subcategory: 'Subcategory',
            pageUrl: 'Page URL',
            media: 'Media',
            actions: 'Actions',
            clickHere: 'Click Here',
            remove: 'Remove',
            noFindings: 'No findings match the current filters yet.',
            editFinding: 'Edit Audit Result',
            newObservation: 'New Audit Result',
            basicInformation: 'Basic Information',
            auditResult: 'Audit Result',
            auditResultHelp: 'Choose whether this area is working correctly or needs attention.',
            outcomePass: 'Working',
            outcomeFail: 'Issue found',
            outcomePartial: 'Partially working',
            outcomeNotApplicable: 'Not applicable',
            outcomeNotTested: 'Not tested',
            servicePlaceholder: 'e.g., Mobile Checkout Flow',
            issueTitlePlaceholder: 'Short descriptive summary of the problem',
            issueDescription: 'Issue Description',
            issueDescriptionPlaceholder: 'Detailed breakdown of the accessibility barrier...',
            positiveNotePlaceholder: 'Briefly explain what is working well here...',
            severityClassification: 'Severity Classification',
            accessibilityCategory: 'Accessibility Category',
            mainCategory: 'Main Category',
            subcategoryLabelOptional: 'Subcategory (Optional)',
            subcategoryHelpOptional: 'You can leave subcategory empty when the result is positive, not applicable, or not tested.',
            selectCategory: 'Select Category',
            selectSubcategory: 'Select Sub-Category',
            evidenceMedia: 'Evidence Media',
            imageProof: 'Image Proof',
            videoDemo: 'Video Demo',
            digitalLocation: 'Digital Location',
            exactPageUrl: 'Exact Page URL',
            pageUrlPlaceholder: 'https://app.client.com/specific-route',
            developerRecommendations: 'Developer Recommendations',
            remediationSteps: 'Remediation Steps',
            remediationPlaceholder: 'Specific guidance for the development team to resolve this issue...',
            recommendationOptionalHelp: 'Add remediation steps only when this result needs follow-up.',
            existingEvidence: 'Existing Evidence',
            cancel: 'Cancel',
            updateFinding: 'Update Finding',
            commitFinding: 'Commit Finding',
            reportPreview: 'Accessibility Report Preview',
            previewDescription: 'This preview is rendered from the backend HTML/PDF pipeline and shows the final accessibility report layout using the current findings and evidence.',
            english: 'English',
            arabic: 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©',
            printPdf: 'Print / Save PDF',
            statusDraft: 'DRAFT',
            statusInReview: 'IN REVIEW',
            statusApproved: 'APPROVED',
            statusPublished: 'PUBLISHED',
            statusArchived: 'ARCHIVED',
            submitForReview: 'Submit for Review',
            approveReport: 'Approve Report',
            publishReport: 'Publish to Client',
            returnToDraft: 'Return to Draft',
            reportLockedTitle: 'Findings are locked outside draft status',
            reportLockedHelp: 'Once a report is submitted for review, findings and evidence stay frozen until PM or Admin returns it to draft.',
            statusUpdateSuccess: 'Report status updated.',
            statusUpdateError: 'Failed to update report status.'
          };

      return decodeMojibakeRecord(localizedCopy);
    },
    [isArabic],
  );

  const ar = React.useCallback((value: string) => decodeMojibakeString(value), []);

  const severityLabel = React.useCallback((severity: ProjectReportEntrySeverity) => {
    if (isArabic) {
      return severity === 'HIGH' ? copy.high : severity === 'MEDIUM' ? copy.medium : severity === 'LOW' ? copy.low : ar('Ø­Ø±Ø¬Ø©');
    }
    return severityCopy[severity] || severity;
  }, [ar, copy.high, copy.low, copy.medium, isArabic]);

  const outcomeLabel = React.useCallback((outcome: ProjectReportEntryOutcome) => {
    if (outcome === 'PASS') return copy.outcomePass;
    if (outcome === 'PARTIAL') return copy.outcomePartial;
    if (outcome === 'NOT_APPLICABLE') return copy.outcomeNotApplicable;
    if (outcome === 'NOT_TESTED') return copy.outcomeNotTested;
    return copy.outcomeFail;
  }, [copy.outcomeFail, copy.outcomeNotApplicable, copy.outcomeNotTested, copy.outcomePartial, copy.outcomePass]);

  const evidenceActionLabel = React.useCallback((media: ProjectReportEntryMedia) => {
    if (isArabic) {
      if (media.mediaType === 'IMAGE') return ar('Ø¹Ø±Ø¶ Ø§Ù„ØµÙˆØ±Ø©');
      if (media.mediaType === 'VIDEO') return ar('Ø¹Ø±Ø¶ Ø§Ù„ÙÙŠØ¯ÙŠÙˆ');
      return ar('Ø¹Ø±Ø¶ Ø§Ù„Ø¯Ù„ÙŠÙ„');
    }
    return mediaActionLabel(media);
  }, [ar, isArabic]);

  const reportStatusLabel = React.useCallback((status: string) => {
    if (status === 'DRAFT') return copy.statusDraft;
    if (status === 'IN_REVIEW') return copy.statusInReview;
    if (status === 'APPROVED') return copy.statusApproved;
    if (status === 'PUBLISHED') return copy.statusPublished;
    if (status === 'ARCHIVED') return copy.statusArchived;
    return status;
  }, [copy.statusApproved, copy.statusArchived, copy.statusDraft, copy.statusInReview, copy.statusPublished]);

  const [loading, setLoading] = React.useState(true);
  const [report, setReport] = React.useState<ProjectReport | null>(null);
  const [entries, setEntries] = React.useState<ProjectReportEntry[]>([]);
  const [entryModalOpen, setEntryModalOpen] = React.useState(false);
  const [editingEntry, setEditingEntry] = React.useState<ProjectReportEntry | null>(null);
  const [entryDraft, setEntryDraft] = React.useState(emptyEntryDraft);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState('');
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewLocale, setPreviewLocale] = React.useState<AccessibilityAuditOutputLocale>('en');
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [generatingAi, setGeneratingAi] = React.useState(false);
  const [savingEntry, setSavingEntry] = React.useState(false);
  const [approvalSteps, setApprovalSteps] = React.useState<ApprovalInfo[]>([]);
  const [approvalReview, setApprovalReview] = React.useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [approvalComment, setApprovalComment] = React.useState('');
  const [uploadProgress, setUploadProgress] = React.useState<Record<EvidenceUploadSlot, number>>({ image: 0, video: 0 });
  const [uploadStatus, setUploadStatus] = React.useState<Record<EvidenceUploadSlot, EvidenceUploadStatus>>({
    image: 'idle',
    video: 'idle',
  });
  const [uploadErrors, setUploadErrors] = React.useState<Record<EvidenceUploadSlot, string>>({ image: '', video: '' });
  const savingEntryRef = React.useRef(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [severityFilter, setSeverityFilter] = React.useState<'ALL' | ProjectReportEntrySeverity>('ALL');
  const [outcomeFilter, setOutcomeFilter] = React.useState<'ALL' | ProjectReportEntryOutcome>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | AccessibilityAuditMainCategory>('ALL');

  const canEditEntries = hasPermission(Permission.EDIT_PROJECT_REPORT_ENTRIES);
  const canEditReport = hasPermission(Permission.EDIT_PROJECT_REPORTS);
  const canPublishReports = hasPermission(Permission.PUBLISH_PROJECT_REPORTS);
  const canGenerateExports = hasPermission(Permission.GENERATE_PROJECT_REPORT_EXPORTS);
  const isClientUser = user?.role === Role.CLIENT_OWNER || user?.role === Role.CLIENT_MANAGER || user?.role === Role.CLIENT_MEMBER;
  const exportPdfLabel = isArabic ? ar('ØªØµØ¯ÙŠØ± PDF') : 'Export PDF';
  const exportInProgressLabel = isArabic ? ar('Ø¬Ø§Ø±Ù ØªØµØ¯ÙŠØ± PDF...') : 'Exporting PDF...';
  const generateAiLabel = isArabic ? ar('Ø¥Ù†Ø´Ø§Ø¡ Ù…Ù„Ø®Øµ Ø°ÙƒÙŠ') : 'Generate AI Summary';
  const generatingAiLabel = isArabic ? 'Generating...' : 'Generating...';
  const savingEntryLabel = isArabic ? 'Saving...' : 'Saving...';
  const uploadingEvidenceLabel = isArabic ? '\u062C\u0627\u0631\u064D \u0631\u0641\u0639 \u0627\u0644\u0623\u062F\u0644\u0629...' : 'Uploading evidence...';
  const uploadingProgressLabel = isArabic ? '\u062C\u0627\u0631\u064D \u0627\u0644\u0631\u0641\u0639...' : 'Uploading...';
  const uploadedSuccessLabel = isArabic ? '\u062A\u0645 \u0627\u0644\u0631\u0641\u0639 \u0628\u0646\u062C\u0627\u062D.' : 'Uploaded successfully.';
  const videoLimitHint = isArabic
    ? `\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u062D\u062C\u0645 \u0627\u0644\u0641\u064A\u062F\u064A\u0648: ${EVIDENCE_UPLOAD_LIMIT_MB} MB \u0644\u0643\u0644 \u0645\u0644\u0641.`
    : `Max video size: ${EVIDENCE_UPLOAD_LIMIT_MB} MB per file.`;

  const taxonomy = React.useMemo(() => getVersionTaxonomy(report?.templateVersion), [report?.templateVersion]);
  const availableCategories = React.useMemo(
    () => taxonomy.categories.filter((category): category is AccessibilityAuditMainCategory => ACCESSIBILITY_AUDIT_MAIN_CATEGORIES.includes(category)),
    [taxonomy.categories],
  );
  const subcategoryOptions = entryDraft.category ? taxonomy.subcategories[entryDraft.category] || [] : [];
  const reportOutputLocale: ProjectReportOutputLocale = report?.outputLocale || getAccessibilityOutputLocale(report?.templateVersion);
  const entryNeedsSeverity = entryDraft.auditOutcome === 'FAIL' || entryDraft.auditOutcome === 'PARTIAL';
  const entryNeedsRecommendation = entryNeedsSeverity;
  const entryNeedsSubcategory = entryNeedsSeverity;
  const isUploadingEvidence = uploadStatus.image === 'uploading' || uploadStatus.video === 'uploading';

  const formatFileSize = React.useCallback((bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const resetEvidenceUploadUi = React.useCallback(() => {
    setImageFile(null);
    setVideoFile(null);
    setUploadProgress({ image: 0, video: 0 });
    setUploadStatus({ image: 'idle', video: 'idle' });
    setUploadErrors({ image: '', video: '' });
  }, []);

  const validateEvidenceFile = React.useCallback((slot: EvidenceUploadSlot, file: File | null) => {
    if (!file) {
      setUploadErrors((current) => ({ ...current, [slot]: '' }));
      setUploadStatus((current) => ({ ...current, [slot]: 'idle' }));
      setUploadProgress((current) => ({ ...current, [slot]: 0 }));
      return true;
    }

    if (file.size > EVIDENCE_UPLOAD_LIMIT_BYTES) {
      const slotLabel = slot === 'video' ? copy.videoDemo : copy.imageProof;
      const message = isArabic
        ? `${slotLabel} \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F ${EVIDENCE_UPLOAD_LIMIT_MB} MB.`
        : `${slotLabel} exceeds ${EVIDENCE_UPLOAD_LIMIT_MB} MB limit.`;
      setUploadErrors((current) => ({ ...current, [slot]: message }));
      setUploadStatus((current) => ({ ...current, [slot]: 'error' }));
      setUploadProgress((current) => ({ ...current, [slot]: 0 }));
      toast.error(message);
      return false;
    }

    setUploadErrors((current) => ({ ...current, [slot]: '' }));
    setUploadStatus((current) => ({ ...current, [slot]: 'idle' }));
    setUploadProgress((current) => ({ ...current, [slot]: 0 }));
    return true;
  }, [copy.imageProof, copy.videoDemo, isArabic]);

  const handleImageFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!validateEvidenceFile('image', file)) {
      setImageFile(null);
      event.target.value = '';
      return;
    }
    setImageFile(file);
  }, [validateEvidenceFile]);

  const handleVideoFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!validateEvidenceFile('video', file)) {
      setVideoFile(null);
      event.target.value = '';
      return;
    }
    setVideoFile(file);
  }, [validateEvidenceFile]);

  const closeEntryModal = React.useCallback(() => {
    if (savingEntry) return;
    setEntryModalOpen(false);
    resetEvidenceUploadUi();
  }, [resetEvidenceUploadUi, savingEntry]);

  const filteredEntries = React.useMemo(() => {
    return entries.filter((entry) => {
      const auditOutcome = getAuditOutcome(entry);
      const matchesSearch = [entry.serviceName, entry.issueTitle, entry.issueDescription, entry.category, entry.subcategory]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesSeverity = severityFilter === 'ALL' || (!!entry.severity && entry.severity === severityFilter);
      const matchesOutcome = outcomeFilter === 'ALL' || auditOutcome === outcomeFilter;
      const matchesCategory = categoryFilter === 'ALL' || entry.category === categoryFilter;
      return matchesSearch && matchesSeverity && matchesOutcome && matchesCategory;
    });
  }, [categoryFilter, entries, outcomeFilter, searchTerm, severityFilter]);

  const summaryCounts = React.useMemo(() => {
    const counts = entries.reduce(
      (acc, entry) => {
        const auditOutcome = getAuditOutcome(entry);
        acc.total += 1;
        if (auditOutcome === 'PASS') acc.pass += 1;
        if (auditOutcome === 'FAIL') acc.fail += 1;
        if (auditOutcome === 'PARTIAL') acc.partial += 1;
        if (auditOutcome === 'NOT_TESTED') acc.notTested += 1;
        if (auditOutcome === 'NOT_APPLICABLE') acc.notApplicable += 1;
        if (entry.severity === 'HIGH') acc.high += 1;
        if (entry.severity === 'MEDIUM') acc.medium += 1;
        if (entry.severity === 'LOW') acc.low += 1;
        return acc;
      },
      { total: 0, pass: 0, fail: 0, partial: 0, notTested: 0, notApplicable: 0, high: 0, medium: 0, low: 0 },
    );
    const scoredChecks = counts.pass + counts.fail + counts.partial;
    const compliance = scoredChecks > 0 ? Math.round(((counts.pass + counts.partial * 0.5) / scoredChecks) * 100) : 0;
    return { ...counts, compliance, scoredChecks };
  }, [entries]);

  const summaryIntroduction = toDisplayText((report?.summaryJson as any)?.introduction);
  const summaryExecutive = toDisplayText((report?.summaryJson as any)?.statisticsSummary || (report?.summaryJson as any)?.executiveSummary);
  const summaryStrengths = toDisplayText((report?.summaryJson as any)?.strengthsSummary);
  const summaryCompliance = toDisplayText((report?.summaryJson as any)?.complianceSummary);
  const summaryRecommendations = toDisplayText((report?.summaryJson as any)?.recommendationsSummary);

  const loadApprovals = React.useCallback(async () => {
    if (!reportId) return;
    try {
      const list = await api.approvals.getByEntity('REPORT', reportId);
      const normalized = (list || []).map((approval: any) => ({
        id: approval.id,
        status: approval.status,
        entityType: approval.entityType,
        entityId: approval.entityId,
        stepOrder: approval.stepOrder,
        approver: approval.approver,
        requestedBy: approval.requestedBy,
        reviewedBy: approval.reviewedBy,
        reviewedAt: approval.reviewedAt,
        comment: approval.comment,
      })) as ApprovalInfo[];
      normalized.sort((a, b) => (a.stepOrder ?? 1) - (b.stepOrder ?? 1));
      setApprovalSteps(normalized);
    } catch (error) {
      console.error('Failed to load report approvals', error);
      setApprovalSteps([]);
    }
  }, [reportId]);

  const loadData = React.useCallback(async () => {
    if (!reportId) return;
    try {
      const [reportData, entryData] = await Promise.all([
        api.reportBuilderProjects.getProjectReport(reportId),
        api.reportBuilderProjects.listEntries(reportId),
      ]);
      setReport(reportData);
      setEntries((entryData || []).map(normalizeWorkspaceEntry));
      setPreviewLocale(reportData.outputLocale || getAccessibilityOutputLocale(reportData.templateVersion));
      await loadApprovals();
    } catch (error) {
      console.error(error);
      toast.error('Failed to load accessibility report.');
    } finally {
      setLoading(false);
    }
  }, [loadApprovals, reportId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const openEntryModal = (entry?: ProjectReportEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setEntryDraft({
        serviceName: entry.serviceName || '',
        issueTitle: entry.issueTitle,
        issueDescription: entry.issueDescription,
        auditOutcome: getAuditOutcome(entry),
        severity: (entry.severity || 'MEDIUM') as ProjectReportEntrySeverity,
        category: (entry.category as AccessibilityAuditMainCategory | '') || '',
        subcategory: entry.subcategory || '',
        pageUrl: entry.pageUrl || '',
        recommendation: entry.recommendation || '',
      });
    } else {
      setEditingEntry(null);
      setEntryDraft(emptyEntryDraft);
    }
    resetEvidenceUploadUi();
    setEntryModalOpen(true);
  };

  const uploadSelectedEvidence = async (entry: ProjectReportEntry) => {
    const uploads: Array<{ slot: EvidenceUploadSlot; file: File }> = [];
    if (imageFile) uploads.push({ slot: 'image', file: imageFile });
    if (videoFile) uploads.push({ slot: 'video', file: videoFile });
    if (!uploads.length) return;

    for (const upload of uploads) {
      setUploadStatus((current) => ({ ...current, [upload.slot]: 'uploading' }));
      setUploadProgress((current) => ({ ...current, [upload.slot]: 0 }));
      setUploadErrors((current) => ({ ...current, [upload.slot]: '' }));

      try {
        await api.reportBuilderProjects.uploadEntryMedia(
          entry.projectReportId,
          entry.id,
          upload.file,
          undefined,
          (percent) => {
            setUploadProgress((current) => ({ ...current, [upload.slot]: percent }));
          },
        );

        setUploadProgress((current) => ({ ...current, [upload.slot]: 100 }));
        setUploadStatus((current) => ({ ...current, [upload.slot]: 'uploaded' }));
        toast.success(`${upload.file.name} ${uploadedSuccessLabel}`);
      } catch (error: any) {
        const message = error?.message || 'Evidence upload failed';
        setUploadStatus((current) => ({ ...current, [upload.slot]: 'error' }));
        setUploadErrors((current) => ({ ...current, [upload.slot]: message }));
        throw error;
      }
    }
  };

  const handleSaveEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportId) return;
    if (savingEntryRef.current) return;

    savingEntryRef.current = true;
    setSavingEntry(true);

    const payload = {
      serviceName: entryDraft.serviceName.trim(),
      issueTitle: entryDraft.issueTitle.trim(),
      issueDescription: entryDraft.issueDescription.trim(),
      severity: entryNeedsSeverity ? entryDraft.severity : undefined,
      category: entryDraft.category,
      subcategory: entryDraft.subcategory,
      pageUrl: normalizeUrl(entryDraft.pageUrl),
      recommendation: entryNeedsRecommendation ? entryDraft.recommendation.trim() : '',
      status: editingEntry?.status || DEFAULT_ENTRY_STATUS,
      rowDataJson: {
        ...(editingEntry?.rowDataJson || {}),
        auditOutcome: entryDraft.auditOutcome,
      },
    };

    try {
      const savedEntry = editingEntry
        ? await api.reportBuilderProjects.updateEntry(reportId, editingEntry.id, payload)
        : await api.reportBuilderProjects.createEntry(reportId, { ...payload, sortOrder: entries.length });

      await uploadSelectedEvidence(savedEntry);
      await loadData();
      setEntryModalOpen(false);
      resetEvidenceUploadUi();
      toast.success(editingEntry ? (isArabic ? ar('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù†ØªÙŠØ¬Ø©.') : 'Audit result updated.') : (isArabic ? ar('ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù†ØªÙŠØ¬Ø©.') : 'Audit result added.'));
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (isArabic ? ar('ØªØ¹Ø°Ø± Ø­ÙØ¸ Ù†ØªÙŠØ¬Ø© Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚.') : 'Failed to save audit result.'));
    } finally {
      savingEntryRef.current = false;
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (entry: ProjectReportEntry) => {
    if (!reportId) return;
    const shouldDelete = await confirm({
      title: isArabic ? ar('Ø­Ø°Ù Ø§Ù„Ù†ØªÙŠØ¬Ø©') : 'Delete result',
      message: isArabic ? `${ar('Ø­Ø°Ù')} "${entry.issueTitle}"${ar('ØŸ')}` : `Delete "${entry.issueTitle}"?`,
      confirmText: isArabic ? ar('Ø­Ø°Ù') : 'Delete',
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.reportBuilderProjects.deleteEntry(reportId, entry.id);
      await loadData();
      toast.success(isArabic ? ar('ØªÙ…Øª Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ù†ØªÙŠØ¬Ø©.') : 'Audit result removed.');
    } catch (error) {
      console.error(error);
      toast.error(isArabic ? ar('ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ù†ØªÙŠØ¬Ø©.') : 'Failed to delete audit result.');
    }
  };

  const handleDeleteEvidence = async (entry: ProjectReportEntry, media: ProjectReportEntryMedia) => {
    if (!reportId) return;
    const fileLabel = media.fileAsset.filename || media.fileAsset.name || 'file';
    const shouldDelete = await confirm({
      title: isArabic ? ar('Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø¯Ù„ÙŠÙ„') : 'Remove evidence',
      message: isArabic ? `${ar('Ø¥Ø²Ø§Ù„Ø©')} "${fileLabel}"${ar('ØŸ')}` : `Remove "${fileLabel}"?`,
      confirmText: isArabic ? ar('Ø¥Ø²Ø§Ù„Ø©') : 'Remove',
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.reportBuilderProjects.deleteEntryMedia(reportId, entry.id, media.id);
      await loadData();
      toast.success('Evidence removed.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to remove evidence.');
    }
  };

  const handleOpenEvidence = async (media: ProjectReportEntryMedia) => {
    if (!projectId) return;
    try {
      const url = await api.projects.downloadFile(projectId, media.fileAsset.id, false);
      if (!url) throw new Error('Evidence file is unavailable');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to open evidence.');
    }
  };

  const resolveExportLocale = React.useCallback(
    (value?: unknown): AccessibilityAuditOutputLocale => (value === 'ar' ? 'ar' : 'en'),
    [],
  );

  const handlePreview = React.useCallback(async (locale?: unknown) => {
    if (!reportId) return;
    setPreviewLoading(true);
    try {
      const nextLocale = resolveExportLocale(locale ?? previewLocale);
      const html = await api.reportBuilderProjects.getPreviewHtml(reportId, nextLocale);
      setPreviewLocale(nextLocale);
      setPreviewHtml(html);
      setPreviewModalOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load report preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, [previewLocale, reportId, resolveExportLocale]);

  const handleGenerateAiSummary = async () => {
    if (!reportId) return;
    setGeneratingAi(true);
    try {
      await api.reportBuilderProjects.generateAiSummary(reportId);
      await loadData();
      toast.success(isArabic ? ar('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù†ØµÙˆØµ Ø§Ù„Ø°ÙƒÙŠØ© Ù„Ù„ØªÙ‚Ø±ÙŠØ±.') : 'AI report narrative generated.');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (isArabic ? ar('ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù†ØµÙˆØµ Ø§Ù„Ø°ÙƒÙŠØ© Ù„Ù„ØªÙ‚Ø±ÙŠØ±.') : 'Failed to generate AI report narrative.'));
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleExportPdf = React.useCallback(async (locale?: unknown) => {
    if (!reportId || !canGenerateExports) return;
    setExportingPdf(true);
    try {
      const nextLocale = resolveExportLocale(locale ?? previewLocale);
      const result = await api.reportBuilderProjects.exportPdf(reportId, nextLocale);
      await loadData();
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
      }
      toast.success(isArabic ? ar('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ù…Ù„Ù PDF Ø¨Ù†Ø¬Ø§Ø­.') : 'PDF exported successfully.');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (isArabic ? ar('ØªØ¹Ø°Ø± ØªØµØ¯ÙŠØ± Ù…Ù„Ù PDF.') : 'Failed to export PDF.'));
    } finally {
      setExportingPdf(false);
    }
  }, [canGenerateExports, isArabic, loadData, previewLocale, reportId, resolveExportLocale]);

  const handleGoBack = React.useCallback(() => {
    navigateBack(navigate, projectId ? `/app/projects/${projectId}` : '/app/projects');
  }, [navigate, projectId]);

  const handleDownloadLatestExport = async () => {
    if (!reportId) return;
    try {
      const latest = await api.reportBuilderProjects.getLatestExport(reportId);
      window.open(latest.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'No exported PDF is available yet.');
    }
  };

  const handleStatusChange = async (nextStatus: ProjectReport['status']) => {
    if (!reportId) return;
    try {
      const updated = await api.reportBuilderProjects.updateProjectReport(reportId, { status: nextStatus });
      setReport(updated);
      toast.success(copy.statusUpdateSuccess);
    } catch (error) {
      console.error(error);
      toast.error(copy.statusUpdateError);
    }
  };

  const handleRequestReportApproval = async () => {
    if (!reportId || !projectId || !report) return;
    try {
      await api.approvals.create({ entityType: 'REPORT', entityId: reportId, projectId });
      const updated = report.status === 'DRAFT'
        ? await api.reportBuilderProjects.updateProjectReport(reportId, { status: 'IN_REVIEW' })
        : report;
      setReport(updated);
      await loadApprovals();
      toast.success(isArabic ? ar('ØªÙ… Ø·Ù„Ø¨ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©.') : 'Approval requested.');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (isArabic ? ar('ØªØ¹Ø°Ø± Ø·Ù„Ø¨ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©.') : 'Failed to request approval.'));
    }
  };

  const handleReviewApproval = async () => {
    if (!reportId || !approvalReview) return;
    const step = approvalSteps.find((item) => item.id === approvalReview.id);
    if (!step) return;
    try {
      if (approvalReview.action === 'approve') {
        await api.approvals.approve(step.id, approvalComment || undefined);
      } else {
        await api.approvals.reject(step.id, approvalComment || undefined);
      }

      const refreshed = await api.approvals.getByEntity('REPORT', reportId);
      const normalized = (refreshed || []).map((approval: any) => ({
        id: approval.id,
        status: approval.status,
        entityType: approval.entityType,
        entityId: approval.entityId,
        stepOrder: approval.stepOrder,
        approver: approval.approver,
        requestedBy: approval.requestedBy,
        reviewedBy: approval.reviewedBy,
        reviewedAt: approval.reviewedAt,
        comment: approval.comment,
      })) as ApprovalInfo[];
      normalized.sort((a, b) => (a.stepOrder ?? 1) - (b.stepOrder ?? 1));
      setApprovalSteps(normalized);

      const nextStatus: ProjectReport['status'] = approvalReview.action === 'reject'
        ? 'DRAFT'
        : normalized.length > 0 && normalized.every((item) => item.status === 'APPROVED')
          ? 'APPROVED'
          : 'IN_REVIEW';
      const updated = await api.reportBuilderProjects.updateProjectReport(reportId, { status: nextStatus });
      setReport(updated);
      setApprovalReview(null);
      setApprovalComment('');
      toast.success(approvalReview.action === 'approve' ? (isArabic ? ar('ØªÙ… Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ø§Ù„ØªÙ‚Ø±ÙŠØ±.') : 'Report approved.') : (isArabic ? ar('ØªÙ… Ø±ÙØ¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±.') : 'Report rejected.'));
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (isArabic ? ar('ØªØ¹Ø°Ø± Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±.') : 'Failed to review report approval.'));
    }
  };

  const handleOutputLocaleChange = async (locale: ProjectReportOutputLocale) => {
    if (!reportId || !canEditReport || !report || report.outputLocale === locale) return;
    try {
      const updated = await api.reportBuilderProjects.updateProjectReport(reportId, { outputLocale: locale });
      setReport(updated);
      setPreviewLocale(locale);
      toast.success(isArabic ? ar('ØªÙ… ØªØ­Ø¯ÙŠØ« Ù„ØºØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ±.') : 'Report language updated.');
    } catch (error) {
      console.error(error);
      toast.error(isArabic ? ar('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ù„ØºØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ±.') : 'Failed to update report language.');
    }
  };

  if (loading) {
    return <GlassCard><p className="text-sm text-slate-600 dark:text-slate-400">{copy.loadingReport}</p></GlassCard>;
  }

  if (!report) {
    return <GlassCard><p className="text-sm text-slate-600 dark:text-slate-400">{copy.reportNotFound}</p></GlassCard>;
  }

  const isDraftReport = report.status === 'DRAFT';
  const canManageDraftContent = canEditEntries && isDraftReport;

  return (
    <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <Button variant="ghost" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{report.title}</h1>
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
              <Badge variant="neutral">{report.visibility}</Badge>
              <Badge variant="neutral">{reportOutputLocale.toUpperCase()}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {report.template.name} / {copy.reportVersion} {report.templateVersion.versionNumber} / {copy.performedBy} {report.performedBy?.name || copy.unknown}
            </p>
            {isClientUser && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {copy.clientReadOnly}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {!isClientUser && canEditReport && (
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                {isArabic ? ar('Ù„ØºØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ±') : 'Report Language'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {isArabic
                  ? ar('Ø§Ø­ÙØ¸ Ù„ØºØ© Ø§Ù„Ø¥Ø®Ø±Ø§Ø¬ Ø§Ù„ØªÙŠ Ø³ÙŠÙØ±Ø§Ø¬Ø¹ ÙˆÙŠÙÙ†Ø´Ø± ÙˆÙŠÙØµØ¯Ø± Ø¨Ù‡Ø§ Ù‡Ø°Ø§ Ø§Ù„ØªÙ‚Ø±ÙŠØ±.')
                  : 'Save the output language this report should be reviewed, published, and exported in.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={reportOutputLocale === 'en' ? 'primary' : 'outline'} onClick={() => handleOutputLocaleChange('en')}>
                  {copy.english}
                </Button>
                <Button type="button" size="sm" variant={reportOutputLocale === 'ar' ? 'primary' : 'outline'} onClick={() => handleOutputLocaleChange('ar')}>
                  {copy.arabic}
                </Button>
              </div>
            </div>
          )}

          {approvalSteps.length > 0 && (
            <GlassCard className="max-w-xl border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Report approvals</p>
                {approvalSteps.some((step) => step.status === 'REJECTED') && <Badge variant="danger">Rejected</Badge>}
                {!approvalSteps.some((step) => step.status === 'REJECTED') && approvalSteps.every((step) => step.status === 'APPROVED') && <Badge variant="success">Approved</Badge>}
                {approvalSteps.some((step) => step.status === 'PENDING') && <Badge variant="warning">Pending approval</Badge>}
              </div>
              <div className="mt-3 space-y-2">
                {approvalSteps.map((step) => (
                  <div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          Step {step.stepOrder ?? 1}
                          {step.approver?.name ? ` · ${step.approver.name}` : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          {step.requestedBy?.name ? `Requested by ${step.requestedBy.name}` : 'Approval request'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={step.status === 'APPROVED' ? 'success' : step.status === 'REJECTED' ? 'danger' : 'warning'}>
                          {step.status}
                        </Badge>
                        {isInternalRole(user?.role) && step.status === 'PENDING' && (
                          <>
                            <Button variant="ghost" size="sm" className="text-[hsl(var(--brand-success))]" onClick={() => setApprovalReview({ id: step.id, action: 'approve' })}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => setApprovalReview({ id: step.id, action: 'reject' })}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {step.comment && <p className="mt-2 text-xs text-slate-500">Comment: {step.comment}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handlePreview(previewLocale)} disabled={previewLoading}>
            <Eye className="mr-2 h-4 w-4" /> {previewLoading ? copy.loadingPreview : copy.previewReport}
          </Button>
          {canGenerateExports && (
            <>
              <Button variant="outline" onClick={handleGenerateAiSummary} disabled={generatingAi || entries.length === 0}>
                <Sparkles className="mr-2 h-4 w-4" /> {generatingAi ? generatingAiLabel : generateAiLabel}
              </Button>
              <Button onClick={() => handleExportPdf(previewLocale)} disabled={exportingPdf}>
                <Download className="mr-2 h-4 w-4" /> {exportingPdf ? exportInProgressLabel : exportPdfLabel}
              </Button>
            </>
          )}
          {(report.exports?.length || 0) > 0 && (
            <Button variant="outline" onClick={handleDownloadLatestExport}>
              <Download className="mr-2 h-4 w-4" /> {copy.downloadLatestExport}
            </Button>
          )}
          {canEditReport && report.status === 'DRAFT' && (
            <Button variant="outline" onClick={() => handleStatusChange('IN_REVIEW')}>
              {copy.submitForReview}
            </Button>
          )}
          {canEditReport && (report.status === 'DRAFT' || report.status === 'IN_REVIEW') && (
            <Button variant="outline" onClick={handleRequestReportApproval}>
              <Send className="mr-2 h-4 w-4" /> {isArabic ? ar('Ø·Ù„Ø¨ Ù…Ø±Ø§Ø¬Ø¹Ø©') : 'Request approval'}
            </Button>
          )}
          {canPublishReports && report.status === 'IN_REVIEW' && (
            <>
              <Button variant="outline" onClick={() => handleStatusChange('DRAFT')}>
                {copy.returnToDraft}
              </Button>
              <Button onClick={() => handleStatusChange('APPROVED')}>
                {copy.approveReport}
              </Button>
            </>
          )}
          {canPublishReports && report.status === 'APPROVED' && (
            <>
              <Button variant="outline" onClick={() => handleStatusChange('DRAFT')}>
                {copy.returnToDraft}
              </Button>
              <Button onClick={() => handleStatusChange('PUBLISHED')}>
                {copy.publishReport}
              </Button>
            </>
          )}
          {canPublishReports && report.status === 'PUBLISHED' && (
            <Button variant="outline" onClick={() => handleStatusChange('DRAFT')}>
              {copy.returnToDraft}
            </Button>
          )}
          {canManageDraftContent && (
            <Button onClick={() => openEntryModal()}>
              <Plus className="mr-2 h-4 w-4" /> {copy.addFinding}
            </Button>
          )}
        </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <GlassCard className="p-3 md:p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.complianceScore}</p>
          <p className="mt-1.5 text-xl font-bold text-cyan-600 md:text-2xl">{summaryCounts.compliance}%</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{summaryCounts.scoredChecks} {isArabic ? ar('Ø¹Ù†ØµØ±Ù‹Ø§ ØªÙ… ØªÙ‚ÙŠÙŠÙ…Ù‡') : 'scored checks'}</p>
        </GlassCard>
        <GlassCard className="p-3 md:p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.workingChecks}</p>
          <p className="mt-1.5 text-xl font-bold text-[hsl(var(--brand-success))] md:text-2xl">{summaryCounts.pass}</p>
        </GlassCard>
        <GlassCard className="p-3 md:p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.needsAttention}</p>
          <p className="mt-1.5 text-xl font-bold text-rose-600 md:text-2xl">{summaryCounts.fail}</p>
        </GlassCard>
        <GlassCard className="p-3 md:p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.partialChecks}</p>
          <p className="mt-1.5 text-xl font-bold text-[hsl(var(--brand-warning))] md:text-2xl">{summaryCounts.partial}</p>
        </GlassCard>
        <GlassCard className="p-3 md:p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.notTested}</p>
          <p className="mt-1.5 text-xl font-bold text-slate-700 dark:text-slate-200 md:text-2xl">{summaryCounts.notTested}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {summaryCounts.notApplicable} {isArabic ? ar('ØºÙŠØ± Ù…Ù†Ø·Ø¨Ù‚') : 'not applicable'}
          </p>
        </GlassCard>
      </div>

      {!isDraftReport && !isClientUser && (
        <GlassCard className="border-[hsl(var(--brand-warning)/0.2)] bg-[hsl(var(--brand-warning)/0.1)] dark:border-[hsl(var(--brand-warning)/0.2)] dark:bg-[hsl(var(--brand-warning)/0.1)]">
          <p className="text-sm font-semibold text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]">{copy.reportLockedTitle}</p>
          <p className="mt-1 text-sm text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]">{copy.reportLockedHelp}</p>
        </GlassCard>
      )}

      {summaryIntroduction || summaryExecutive || summaryStrengths || summaryCompliance || summaryRecommendations ? (
        <GlassCard>
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-cyan-500" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{copy.aiReportSummary}</h2>
          </div>
          <div className="grid gap-4 xl:grid-cols-12">
            {summaryIntroduction && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 xl:col-span-4">
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{copy.introduction}</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{summaryIntroduction}</p>
              </div>
            )}
            {summaryExecutive && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 xl:col-span-4">
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{copy.executiveSummary}</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{summaryExecutive}</p>
              </div>
            )}
            {summaryStrengths && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 xl:col-span-4">
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{copy.strengthsSummary}</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{summaryStrengths}</p>
              </div>
            )}
            {summaryCompliance && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 xl:col-span-6">
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{copy.complianceSummary}</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{summaryCompliance}</p>
              </div>
            )}
            {summaryRecommendations && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 xl:col-span-6">
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{copy.recommendationsSummary}</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{summaryRecommendations}</p>
              </div>
            )}
          </div>
        </GlassCard>
      ) : null}

      <GlassCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{copy.findingsList}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {copy.findingsListDescription}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative min-w-[220px]">
              <Input placeholder={copy.searchFindings} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-10" />
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            </div>
            <Select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as 'ALL' | ProjectReportEntryOutcome)}>
              <option value="ALL">{copy.allOutcomes}</option>
              {AUDIT_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabel(outcome)}</option>)}
            </Select>
            <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as 'ALL' | ProjectReportEntrySeverity)}>
              <option value="ALL">{copy.allSeverities}</option>
              {SEVERITIES.map((severity) => <option key={severity} value={severity}>{severityLabel(severity)}</option>)}
            </Select>
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'ALL' | AccessibilityAuditMainCategory)}>
              <option value="ALL">{copy.allCategories}</option>
              {availableCategories.map((category) => <option key={category} value={category}>{getAccessibilityCategoryLabel(category, uiLocale)}</option>)}
            </Select>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="pb-3 pr-4">{copy.serviceName}</th>
                <th className="pb-3 pr-4">{copy.issueTitle}</th>
                <th className="pb-3 pr-4">{copy.outcome}</th>
                <th className="pb-3 pr-4">{copy.severity}</th>
                <th className="pb-3 pr-4">{copy.category}</th>
                <th className="pb-3 pr-4">{copy.subcategory}</th>
                <th className="pb-3 pr-4">{copy.pageUrl}</th>
                <th className="pb-3 pr-4">{copy.media}</th>
                {canManageDraftContent && <th className="pb-3 text-right">{copy.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredEntries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr>
                    <td className="py-4 pr-4 text-slate-700 dark:text-slate-300">{entry.serviceName || '-'}</td>
                    <td className="py-4 pr-4">
                      <p className="font-medium text-slate-900 dark:text-white">{entry.issueTitle}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{entry.issueDescription}</p>
                    </td>
                    <td className="py-4 pr-4"><Badge variant={outcomeVariant[getAuditOutcome(entry)]}>{outcomeLabel(getAuditOutcome(entry))}</Badge></td>
                    <td className="py-4 pr-4">
                      {entry.severity ? (
                        <Badge variant={severityBadgeVariant[(entry.severity || 'MEDIUM') as ProjectReportEntrySeverity]}>
                          {severityLabel((entry.severity || 'MEDIUM') as ProjectReportEntrySeverity)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-slate-700 dark:text-slate-300">{entry.category ? getAccessibilityCategoryLabel(entry.category, uiLocale) : '-'}</td>
                    <td className="py-4 pr-4 text-slate-700 dark:text-slate-300">{entry.category && entry.subcategory ? getAccessibilitySubcategoryLabel(entry.category, entry.subcategory, uiLocale) : entry.subcategory || '-'}</td>
                    <td className="py-4 pr-4">
                      {entry.pageUrl ? <a href={entry.pageUrl} target="_blank" rel="noreferrer" className="font-medium text-cyan-600 hover:underline dark:text-cyan-400">{copy.clickHere}</a> : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {(entry.media || []).length > 0 ? (entry.media || []).map((media) => (
                          <button key={media.id} type="button" onClick={() => handleOpenEvidence(media)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-cyan-300">
                            {evidenceActionLabel(media)}
                          </button>
                        )) : <span className="text-slate-500">-</span>}
                      </div>
                    </td>
                    {canManageDraftContent && (
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEntryModal(entry)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => handleDeleteEntry(entry)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {(entry.media || []).length > 0 && (
                    <tr className="bg-slate-50/70 dark:bg-slate-900/20">
                      <td colSpan={canManageDraftContent ? 9 : 8} className="py-3 pr-4">
                        <div className="flex flex-wrap gap-3">
                          {(entry.media || []).map((media) => (
                            <div key={media.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              {media.mediaType === 'VIDEO' ? <Video className="h-4 w-4 text-cyan-500" /> : <FileImage className="h-4 w-4 text-cyan-500" />}
                              <span className="text-xs text-slate-700 dark:text-slate-300">{media.fileAsset.filename || media.fileAsset.name}</span>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEvidence(media)}>{evidenceActionLabel(media)}</Button>
                              {canManageDraftContent && <button type="button" className="text-xs text-rose-500" onClick={() => handleDeleteEvidence(entry, media)}>{copy.remove}</button>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={canManageDraftContent ? 9 : 8} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    {copy.noFindings}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <Modal
        isOpen={!!approvalReview}
        onClose={() => { setApprovalReview(null); setApprovalComment(''); }}
        title={approvalReview?.action === 'approve'
          ? (isArabic ? ar('Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ø§Ù„ØªÙ‚Ø±ÙŠØ±') : 'Approve report')
          : (isArabic ? ar('Ø±ÙØ¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±') : 'Reject report')}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {approvalReview?.action === 'approve'
              ? (isArabic ? ar('Ø³ÙŠØªÙ… Ø¥Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø·Ø¨Ù‚Ø© ÙˆØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ± ÙÙˆØ±ÙŠÙ‹Ø§.') : 'This step will be approved and the report status will update immediately.')
              : (isArabic ? ar('Ø³ÙŠØªÙ… Ø±ÙØ¶ Ø§Ù„Ø·Ø¨Ù‚Ø© ÙˆØ¥Ø±Ø¬Ø§Ø¹ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©.') : 'This step will be rejected and the report will be returned to draft.')}
          </p>
          <TextArea
            label={isArabic ? ar('ØªØ¹Ù„ÙŠÙ‚ Ø§Ø®ØªÙŠØ§Ø±ÙŠ') : 'Optional comment'}
            value={approvalComment}
            onChange={(event) => setApprovalComment(event.target.value)}
            placeholder={isArabic ? ar('Ø§ÙƒØªØ¨ Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ø®ØªÙŠØ§Ø±ÙŠØ©...') : 'Write an optional note...'}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setApprovalReview(null); setApprovalComment(''); }}>
              {copy.cancel}
            </Button>
            <Button onClick={handleReviewApproval}>
              {approvalReview?.action === 'approve'
                ? (isArabic ? ar('Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©') : 'Approve')
                : (isArabic ? ar('Ø±ÙØ¶') : 'Reject')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={entryModalOpen} onClose={closeEntryModal} title={editingEntry ? copy.editFinding : copy.newObservation} maxWidth="max-w-5xl">
        <form className="space-y-8" onSubmit={handleSaveEntry}>
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-blue-600">
              <span className="h-6 w-1 rounded-full bg-blue-500" /> {copy.basicInformation}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={copy.serviceName} placeholder={copy.servicePlaceholder} value={entryDraft.serviceName} onChange={(event) => setEntryDraft((current) => ({ ...current, serviceName: event.target.value }))} required />
              <Input label={copy.issueTitle} placeholder={entryNeedsRecommendation ? copy.issueTitlePlaceholder : copy.positiveNotePlaceholder} value={entryDraft.issueTitle} onChange={(event) => setEntryDraft((current) => ({ ...current, issueTitle: event.target.value }))} required />
            </div>
            <TextArea label={copy.issueDescription} placeholder={entryNeedsRecommendation ? copy.issueDescriptionPlaceholder : copy.positiveNotePlaceholder} value={entryDraft.issueDescription} onChange={(event) => setEntryDraft((current) => ({ ...current, issueDescription: event.target.value }))} required />
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-[hsl(var(--brand-success))]">
              <span className="h-6 w-1 rounded-full bg-[hsl(var(--brand-success))]" /> {copy.auditResult}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{copy.auditResultHelp}</p>
            <div className="grid gap-3 md:grid-cols-5">
              {AUDIT_OUTCOMES.map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  onClick={() => setEntryDraft((current) => ({ ...current, auditOutcome: outcome }))}
                  className={`rounded-2xl border px-4 py-5 text-center text-sm font-bold transition-all ${
                    entryDraft.auditOutcome === outcome
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm dark:bg-cyan-500/10 dark:text-cyan-300'
                      : 'border-slate-200 text-slate-500 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {outcomeLabel(outcome)}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-orange-500">
              <span className="h-6 w-1 rounded-full bg-orange-500" /> {copy.severityClassification}
            </div>
            {entryNeedsSeverity ? (
              <div className="grid gap-3 md:grid-cols-3">
                {SEVERITIES.map((severity) => (
                  <button key={severity} type="button" onClick={() => setEntryDraft((current) => ({ ...current, severity }))} className={`rounded-2xl border px-4 py-5 text-center text-sm font-bold uppercase tracking-[0.28em] transition-all ${entryDraft.severity === severity ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 text-slate-500 hover:border-blue-300 dark:border-slate-700 dark:text-slate-300'}`}>
                    {severityLabel(severity)}
                  </button>
                ))}
              </div>
            ) : (
              <GlassCard className="border-[hsl(var(--brand-success)/0.2)] bg-[hsl(var(--brand-success)/0.1)] dark:border-[hsl(var(--brand-success)/0.2)] dark:bg-[hsl(var(--brand-success)/0.1)]">
                <p className="text-sm text-[hsl(var(--brand-success))] dark:text-[hsl(var(--brand-success))]">
                  {isArabic ? ar('Ù„ÙŠØ³Øª Ù‡Ù†Ø§Ùƒ Ø­Ø§Ø¬Ø© Ù„ØªØ­Ø¯ÙŠØ¯ Ø´Ø¯Ø© Ø¹Ù†Ø¯Ù…Ø§ ØªÙƒÙˆÙ† Ø§Ù„Ù†ØªÙŠØ¬Ø© Ù†Ø§Ø¬Ø­Ø© Ø£Ùˆ ØºÙŠØ± Ù…Ù†Ø·Ø¨Ù‚Ø© Ø£Ùˆ ØºÙŠØ± Ù…Ø®ØªØ¨Ø±Ø©.') : 'Severity is only needed when the result has an issue or is partially working.'}
                </p>
              </GlassCard>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-fuchsia-500">
              <span className="h-6 w-1 rounded-full bg-fuchsia-500" /> {copy.accessibilityCategory}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Select label={copy.mainCategory} value={entryDraft.category} onChange={(event) => setEntryDraft((current) => ({ ...current, category: event.target.value as AccessibilityAuditMainCategory, subcategory: '' }))} required>
                <option value="">{copy.selectCategory}</option>
                {availableCategories.map((category) => <option key={category} value={category}>{getAccessibilityCategoryLabel(category, uiLocale)}</option>)}
              </Select>
              <div>
                {!entryNeedsSubcategory && (
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{copy.subcategoryHelpOptional}</p>
                )}
                <Select label={entryNeedsSubcategory ? copy.subcategory : copy.subcategoryLabelOptional} value={entryDraft.subcategory} onChange={(event) => setEntryDraft((current) => ({ ...current, subcategory: event.target.value }))} required={entryNeedsSubcategory}>
                <option value="">{copy.selectSubcategory}</option>
                {subcategoryOptions.map((subcategory) => <option key={subcategory} value={subcategory}>{getAccessibilitySubcategoryLabel(entryDraft.category, subcategory, uiLocale)}</option>)}
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-[hsl(var(--brand-success))]">
              <span className="h-6 w-1 rounded-full bg-[hsl(var(--brand-success))]" /> {copy.evidenceMedia}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">{copy.imageProof}</label>
                <label className="flex min-h-[56px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-500 transition-all hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
                  <Upload className="mr-2 h-4 w-4" /> {imageFile ? imageFile.name : copy.imageProof}
                </label>
                {imageFile && (
                  <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
                    {imageFile.name} ({formatFileSize(imageFile.size)})
                  </p>
                )}
                {uploadStatus.image === 'uploading' && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/30">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all"
                        style={{ width: `${uploadProgress.image}%` }}
                      />
                    </div>
                    <p className="text-xs text-cyan-400">{uploadingProgressLabel} {uploadProgress.image}%</p>
                  </div>
                )}
                {uploadStatus.image === 'uploaded' && (
                  <p className="mt-2 text-xs text-[hsl(var(--brand-success))]">{uploadedSuccessLabel}</p>
                )}
                {uploadErrors.image && (
                  <p className="mt-2 text-xs text-rose-500">{uploadErrors.image}</p>
                )}
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">{copy.videoDemo}</label>
                <label className="flex min-h-[56px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-500 transition-all hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300">
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideoFileChange} />
                  <Video className="mr-2 h-4 w-4" /> {videoFile ? videoFile.name : copy.videoDemo}
                </label>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{videoLimitHint}</p>
                {videoFile && (
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {videoFile.name} ({formatFileSize(videoFile.size)})
                  </p>
                )}
                {uploadStatus.video === 'uploading' && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/30">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all"
                        style={{ width: `${uploadProgress.video}%` }}
                      />
                    </div>
                    <p className="text-xs text-cyan-400">{uploadingProgressLabel} {uploadProgress.video}%</p>
                  </div>
                )}
                {uploadStatus.video === 'uploaded' && (
                  <p className="mt-2 text-xs text-[hsl(var(--brand-success))]">{uploadedSuccessLabel}</p>
                )}
                {uploadErrors.video && (
                  <p className="mt-2 text-xs text-rose-500">{uploadErrors.video}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-cyan-500">
              <span className="h-6 w-1 rounded-full bg-cyan-500" /> {copy.digitalLocation}
            </div>
            <Input label={copy.exactPageUrl} placeholder={copy.pageUrlPlaceholder} value={entryDraft.pageUrl} onChange={(event) => setEntryDraft((current) => ({ ...current, pageUrl: event.target.value }))} required />
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.28em] text-indigo-500">
              <span className="h-6 w-1 rounded-full bg-indigo-500" /> {copy.developerRecommendations}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{copy.recommendationOptionalHelp}</p>
            <TextArea
              label={copy.remediationSteps}
              placeholder={entryNeedsRecommendation ? copy.remediationPlaceholder : copy.positiveNotePlaceholder}
              value={entryDraft.recommendation}
              onChange={(event) => setEntryDraft((current) => ({ ...current, recommendation: event.target.value }))}
              required={entryNeedsRecommendation}
            />
          </section>

          {editingEntry && (editingEntry.media || []).length > 0 && (
            <section className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{copy.existingEvidence}</h3>
              <div className="flex flex-wrap gap-3">
                {(editingEntry.media || []).map((media) => (
                  <div key={media.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                    {media.mediaType === 'VIDEO' ? <Video className="h-4 w-4 text-cyan-500" /> : <FileImage className="h-4 w-4 text-cyan-500" />}
                    <span>{media.fileAsset.filename || media.fileAsset.name}</span>
                    <button type="button" className="text-rose-500" onClick={() => handleDeleteEvidence(editingEntry, media)}>{copy.remove}</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={closeEntryModal} disabled={savingEntry}>{copy.cancel}</Button>
            <Button type="submit" disabled={savingEntry}>
              {savingEntry ? (isUploadingEvidence ? uploadingEvidenceLabel : savingEntryLabel) : (editingEntry ? copy.updateFinding : copy.commitFinding)}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={previewModalOpen} onClose={() => setPreviewModalOpen(false)} title={copy.reportPreview} maxWidth="max-w-6xl">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {copy.previewDescription}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={previewLocale === 'en' ? 'primary' : 'outline'} onClick={() => handlePreview('en')}>
                {copy.english}
              </Button>
              <Button type="button" size="sm" variant={previewLocale === 'ar' ? 'primary' : 'outline'} onClick={() => handlePreview('ar')}>
                {copy.arabic}
              </Button>
              {canGenerateExports && (
                <Button type="button" size="sm" variant="outline" onClick={() => handleExportPdf(previewLocale)} disabled={exportingPdf}>
                  {exportingPdf ? exportInProgressLabel : exportPdfLabel}
                </Button>
              )}
            </div>
          </div>
          <iframe id="project-report-preview-frame" title={copy.reportPreview} className="min-h-[70vh] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800" srcDoc={previewHtml} />
        </div>
      </Modal>
    </div>
  );
};

export default ProjectReportWorkspace;






