export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OPS = 'OPS',
  PM = 'PM',
  DEV = 'DEV',
  QA = 'QA',
  FINANCE = 'FINANCE',
  CLIENT_OWNER = 'CLIENT_OWNER',
  CLIENT_MANAGER = 'CLIENT_MANAGER',
  CLIENT_MEMBER = 'CLIENT_MEMBER',
  VIEWER = 'VIEWER'
}

export const isInternalRole = (role: Role): boolean => {
  return [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.DEV, Role.QA, Role.FINANCE].includes(role);
};

export enum Permission {
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  MANAGE_CLIENTS = 'MANAGE_CLIENTS',
  VIEW_CLIENTS = 'VIEW_CLIENTS',
  MANAGE_PROJECTS = 'MANAGE_PROJECTS',
  VIEW_FINANCIALS = 'VIEW_FINANCIALS',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_ADMIN = 'VIEW_ADMIN',
  MANAGE_TASKS = 'MANAGE_TASKS',
  MANAGE_TEAM = 'MANAGE_TEAM',
  MANAGE_REPORT_TEMPLATES = 'MANAGE_REPORT_TEMPLATES',
  ASSIGN_REPORT_TEMPLATES = 'ASSIGN_REPORT_TEMPLATES',
  MANAGE_WORKSPACE_TEMPLATES = 'MANAGE_WORKSPACE_TEMPLATES',
  ASSIGN_WORKSPACE_TEMPLATES = 'ASSIGN_WORKSPACE_TEMPLATES',
  CREATE_PROJECT_REPORTS = 'CREATE_PROJECT_REPORTS',
  EDIT_PROJECT_REPORTS = 'EDIT_PROJECT_REPORTS',
  EDIT_PROJECT_REPORT_ENTRIES = 'EDIT_PROJECT_REPORT_ENTRIES',
  GENERATE_PROJECT_REPORT_EXPORTS = 'GENERATE_PROJECT_REPORT_EXPORTS',
  PUBLISH_PROJECT_REPORTS = 'PUBLISH_PROJECT_REPORTS',
  VIEW_CLIENT_REPORTS = 'VIEW_CLIENT_REPORTS'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  isActive?: boolean;
  orgId?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Extra permissions beyond role defaults (e.g. MANAGE_CLIENTS, VIEW_FINANCIALS) */
  customPermissions?: string[];
  twoFactorEnabled?: boolean;
  clientMemberships?: Array<{
    id: string;
    clientId: string;
    role: Role;
    createdAt: string;
    client: {
      id: string;
      name: string;
      status: ClientStatus;
    };
  }>;
  latestInvite?: {
    id: string;
    createdAt: string;
    expiresAt: string;
    usedAt?: string | null;
  } | null;
  hasAcceptedInvite?: boolean;
  invitePending?: boolean;
  inviteExpired?: boolean;
}

export interface CreateUserResult {
  user: User;
  inviteLink?: string;
  expiresAt?: string;
  inviteEmailSent?: boolean;
  inviteEmailError?: string;
}

export interface ResendInviteResult {
  inviteLink: string;
  expiresAt: string;
  emailSent: boolean;
  emailError?: string;
}

export type ClientStatus = 'active' | 'inactive' | 'archived';

export interface ClientBillingProfile {
  currency: string;
  vatNumber?: string;
  taxId?: string;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logo?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  rolePermissionsJson?: Record<Role, string[]> | null;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  status: ClientStatus;
  contactPerson: string;
  email: string;
  phone?: string;
  website?: string;
  address?: string;
  billing: ClientBillingProfile;
  notes?: string;
  logo?: string;
  logoUrl?: string;
  revenueYTD: number;
  outstandingBalance: number;
  lastActivity: string;
}

export interface ClientMember {
  id: string;
  clientId: string;
  userId: string;
  name: string; // Denormalized for display
  role: Role;
  joinedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: Role;
  joinedAt: string;
}

export interface FileAsset {
  id: string;
  entityId?: string;
  name: string;
  filename?: string;
  category: 'contract' | 'invoice' | 'brief' | 'design' | 'docs' | 'build' | 'report' | 'other' | string;
  type: string;
  mimeType?: string;
  size: string;
  sizeBytes?: number;
  url: string;
  uploadedAt: string;
  uploaderName: string;
  visibility?: 'internal' | 'public' | 'INTERNAL' | 'CLIENT' | string;
  scopeType?: 'CLIENT' | 'PROJECT' | 'FINDING' | string;
  clientId?: string;
  projectId?: string;
}

export interface Report {
  id: string;
  projectId: string;
  title: string;
  type: 'TECHNICAL' | 'EXECUTIVE' | 'COMPLIANCE' | 'OTHER' | string;
  description?: string | null;
  generatedAt?: string;
  generatedBy?: string;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  visibility?: 'INTERNAL' | 'CLIENT' | string;
  url?: string;
  /** Backend: key for generated file (e.g. reports/xxx.pptx) */
  generatedFileKey?: string | null;
  generatedFileSizeBytes?: number;
  project?: { id: string; name: string };
  createdBy?: { id: string; name: string; email?: string };
}

export type ReportBuilderTemplateCategory =
  | 'ACCESSIBILITY'
  | 'SECURITY'
  | 'QA'
  | 'PERFORMANCE'
  | 'COMPLIANCE'
  | 'OTHER';

export type ReportBuilderTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ReportBuilderTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  schemaJson: Record<string, unknown>;
  pdfConfigJson?: Record<string, unknown> | null;
  aiConfigJson?: Record<string, unknown> | null;
  taxonomyJson?: Record<string, unknown> | null;
  isPublished: boolean;
  publishedAt?: string | null;
  createdAt: string;
}

export interface ReportBuilderTemplate {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  category: ReportBuilderTemplateCategory;
  status: ReportBuilderTemplateStatus;
  createdAt: string;
  updatedAt: string;
  versions: ReportBuilderTemplateVersion[];
  _count?: {
    assignments: number;
    projectReports: number;
  };
}

export interface ClientReportTemplateAssignment {
  id: string;
  clientId: string;
  templateId: string;
  templateVersionId: string;
  isDefault: boolean;
  isActive: boolean;
  assignedAt: string;
  template: Pick<ReportBuilderTemplate, 'id' | 'name' | 'code' | 'category' | 'status'>;
  templateVersion: ReportBuilderTemplateVersion;
}

export type ProjectReportStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type ProjectReportVisibility = 'INTERNAL' | 'CLIENT';
export type ProjectReportOutputLocale = 'en' | 'ar';
export type ProjectReportEntrySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ProjectReportEntryStatus = 'OPEN' | 'ACCEPTED' | 'FIXED' | 'VERIFIED' | 'DISMISSED';
export type ProjectReportEntryOutcome = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_APPLICABLE' | 'NOT_TESTED';

export interface ProjectReportEntryMedia {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  caption?: string | null;
  sortOrder: number;
  fileAsset: FileAsset;
}

export interface ProjectReportEntry {
  id: string;
  projectReportId: string;
  sortOrder: number;
  serviceName?: string | null;
  issueTitle: string;
  issueDescription: string;
  severity?: ProjectReportEntrySeverity | null;
  category?: string | null;
  subcategory?: string | null;
  pageUrl?: string | null;
  recommendation?: string | null;
  status: ProjectReportEntryStatus;
  auditOutcome?: ProjectReportEntryOutcome;
  rowDataJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  media?: ProjectReportEntryMedia[];
}

export interface ProjectReport {
  id: string;
  projectId: string;
  clientId: string;
  templateId: string;
  templateVersionId: string;
  title: string;
  description?: string | null;
  outputLocale: ProjectReportOutputLocale;
  status: ProjectReportStatus;
  visibility: ProjectReportVisibility;
  summaryJson?: Record<string, unknown> | null;
  coverSnapshotJson?: Record<string, unknown> | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string };
  client?: { id: string; name: string };
  template: Pick<ReportBuilderTemplate, 'id' | 'name' | 'code' | 'category' | 'status'>;
  templateVersion: ReportBuilderTemplateVersion;
  performedBy?: Pick<User, 'id' | 'name' | 'email' | 'role'>;
  exports?: Array<{ id: string; exportVersion: number; outputLocale: ProjectReportOutputLocale; fileAsset?: FileAsset | null }>;
  _count?: {
    entries: number;
    exports: number;
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  readAt: string | null;
  linkUrl?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  emailTasks: boolean;
  emailFindings: boolean;
  emailInvoices: boolean;
  inApp: boolean;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  minutes: number;
  date: string;
  billable: boolean;
  note?: string | null;
  user?: { id: string; name: string };
  task?: { id: string; title: string; projectId?: string };
}

export interface ActivityLog {
  id: string;
  entityId: string;
  action: string; // e.g., 'created', 'updated', 'uploaded'
  description: string;
  userId: string;
  userName: string;
  timestamp: string;
  type?: 'file' | 'update' | 'comment' | 'system';
}

export interface Discussion {
  id: string;
  projectId: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  replyCount: number;
  lastReplyAt?: string;
  createdAt: string;
  updatedAt: string;
  clientRequestId?: string;
  syncState?: 'pending' | 'failed';
  errorMessage?: string;
}

export interface DiscussionReply {
  id: string;
  discussionId: string;
  body: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  clientRequestId?: string;
  syncState?: 'pending' | 'failed';
  errorMessage?: string;
}

export type ProjectStatus = 'planning' | 'in_progress' | 'testing' | 'deployed' | 'maintenance' | 'archived' | 'on_hold' | 'completed';
export type ProjectHealth = 'good' | 'at-risk' | 'critical';
export type WorkspaceAudienceType = 'internal' | 'client' | 'mixed';
export type WorkspaceTabState = 'hidden' | 'visible_read_only' | 'visible_interactive';
export type WorkspaceTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ProjectWorkspaceConfigTab {
  tabId: string;
  state: WorkspaceTabState;
  orderIndex: number;
}

export interface ProjectWorkspaceTemplateDefinition {
  tabs: ProjectWorkspaceConfigTab[];
  overviewSections?: string[];
}

export interface ProjectWorkspaceConfigDraft {
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  assignedClientId?: string;
  audienceType: WorkspaceAudienceType;
  tabs: ProjectWorkspaceConfigTab[];
  overviewSections?: string[];
}

export interface ProjectWorkspaceConfig {
  id: string;
  projectId: string;
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: number | null;
  assignedClientId?: string | null;
  audienceType: WorkspaceAudienceType;
  tabsJson: ProjectWorkspaceConfigTab[];
  overviewSectionsJson?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWorkspaceTemplate {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  audienceType: WorkspaceAudienceType;
  status: WorkspaceTemplateStatus;
  isDefault: boolean;
  definitionJson: ProjectWorkspaceTemplateDefinition;
  createdAt: string;
  updatedAt: string;
  _count?: {
    assignments: number;
    projectConfigs: number;
  };
}

export interface ClientWorkspaceTemplateAssignment {
  id: string;
  clientId: string;
  templateId: string;
  isDefault: boolean;
  isActive: boolean;
  assignedAt: string;
  template: Pick<ProjectWorkspaceTemplate, 'id' | 'name' | 'audienceType' | 'status' | 'isDefault' | 'definitionJson'>;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  startDate: string;
  deadline: string;
  budget: number;
  health: ProjectHealth;
  description?: string;
  tags?: string[];
  workspaceConfig?: ProjectWorkspaceConfig | null;
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueDate: string;
  status: MilestoneStatus;
  percentComplete: number;
  ownerId?: string;
  ownerName?: string;
  description?: string;
  tasks?: any[];
  stats?: {
    total: number;
    completed: number;
    overdue: number;
    progress: number;
    statusText: string;
  };
}

export interface EvidenceFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Finding {
  id: string;
  projectId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'in_review' | 'ready_for_testing' | 'closed' | 'dismissed' | 'blocked';
  visibility: 'INTERNAL' | 'CLIENT';
  ownerName?: string;
  reportedById?: string;
  assignedToId?: string;
  remediation?: string;
  impact?: string;
  reportedBy?: {
    id: string;
    name: string;
    email: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id?: string;
    name: string;
    clientId?: string;
    client?: {
      id?: string;
      name: string;
    };
  };
  updatedAt?: string;
  createdAt?: string;
  evidence?: EvidenceFile[];
  timeline?: {
    id: string;
    action: string;
    user: string;
    date: string;
    detail?: string;
  }[];
}

export interface ProjectUpdate {
  id: string;
  projectId: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  timestamp: string;
  type: 'general' | 'milestone' | 'risk';
  visibility: 'internal' | 'public';
}

export interface EnvironmentAccess {
  id: string;
  projectId: string;
  name: string;
  url: string;
  credentials?: {
    username?: string;
    passwordHash?: string; // Legacy/mock field kept for compatibility
  };
}

export interface Invoice {
  id: string;
  projectId: string;
  reference: string;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  dueDate: string;
  issuedDate: string;
}

export interface Contract {
    id: string;
    projectId: string;
    amount: number;
    currency: string;
    startDate: string;
    endDate: string;
    status: 'draft' | 'active' | 'completed' | 'cancelled';
    agreementLocale?: string;
    agreementStatus?: string;
    agreementDownloadUrl?: string;
    agreementPayloadJson?: Record<string, unknown>;
    agreementPdfFileAssetId?: string;
    agreementGeneratedAt?: string;
    agreementSignedAt?: string;
    agreementSignedById?: string;
  }

export interface CommentMessage {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
}

export interface CommentThread {
  id: string;
  projectId: string;
  topic: string;
  status: 'open' | 'resolved';
  messages: CommentMessage[];
  lastUpdated: string;
}

// --- TASKS ---
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeName?: string;
  milestoneId?: string;
  sprintId?: string;
  storyPoints?: number;
  startDate?: string;
  dueDate?: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  comments?: CommentMessage[]; // Internal comments on the task
}

export type SprintStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string | null;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  _count?: { tasks: number };
}

export interface KpiStat {
  label: string;
  value: string | number;
  trend?: number; // percentage
  trendDirection?: 'up' | 'down';
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.OPS]: [Permission.VIEW_DASHBOARD, Permission.MANAGE_CLIENTS, Permission.MANAGE_PROJECTS, Permission.VIEW_CLIENTS, Permission.VIEW_FINANCIALS, Permission.MANAGE_TASKS, Permission.MANAGE_TEAM, Permission.MANAGE_WORKSPACE_TEMPLATES, Permission.ASSIGN_WORKSPACE_TEMPLATES],
  [Role.PM]: [Permission.VIEW_DASHBOARD, Permission.MANAGE_PROJECTS, Permission.VIEW_CLIENTS, Permission.VIEW_FINANCIALS, Permission.MANAGE_TASKS, Permission.MANAGE_TEAM, Permission.CREATE_PROJECT_REPORTS, Permission.EDIT_PROJECT_REPORTS, Permission.EDIT_PROJECT_REPORT_ENTRIES, Permission.GENERATE_PROJECT_REPORT_EXPORTS, Permission.PUBLISH_PROJECT_REPORTS],
  [Role.DEV]: [Permission.VIEW_DASHBOARD, Permission.VIEW_CLIENTS, Permission.MANAGE_TASKS, Permission.CREATE_PROJECT_REPORTS, Permission.EDIT_PROJECT_REPORTS, Permission.EDIT_PROJECT_REPORT_ENTRIES],
  [Role.QA]: [Permission.VIEW_DASHBOARD, Permission.MANAGE_TASKS, Permission.CREATE_PROJECT_REPORTS, Permission.EDIT_PROJECT_REPORTS, Permission.EDIT_PROJECT_REPORT_ENTRIES, Permission.GENERATE_PROJECT_REPORT_EXPORTS],
  [Role.FINANCE]: [Permission.VIEW_DASHBOARD, Permission.VIEW_CLIENTS, Permission.VIEW_FINANCIALS],
  [Role.CLIENT_OWNER]: [Permission.VIEW_DASHBOARD, Permission.VIEW_CLIENTS, Permission.VIEW_CLIENT_REPORTS],
  [Role.CLIENT_MANAGER]: [Permission.VIEW_DASHBOARD, Permission.VIEW_CLIENTS, Permission.VIEW_CLIENT_REPORTS],
  [Role.CLIENT_MEMBER]: [Permission.VIEW_DASHBOARD, Permission.VIEW_CLIENT_REPORTS],
  [Role.VIEWER]: [Permission.VIEW_DASHBOARD]
};

export interface ReadinessAction {
  type: 'navigate_tab' | 'open_edit_project';
  target?: string;
}

export interface ReadinessItem {
  id: string;
  label: string;
  status: 'complete' | 'missing' | 'not_applicable';
  type: 'required' | 'conditional';
  tab?: string;
  action?: ReadinessAction;
}

export interface ReadinessSection {
  items: ReadinessItem[];
  summary: string;
}

export interface ProjectReadiness {
  stage: 'SETUP' | 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'DONE' | 'READY_FOR_BILLING';
  stageExplanation: string;
  sections: {
    core: ReadinessSection;
    planning: ReadinessSection;
    resources: ReadinessSection;
  };
  nextAction: {
    label: string;
    tab: string;
    reason?: string;
    action?: ReadinessAction;
  };
  stats: {
    totalRequired: number;
    completedRequired: number;
    totalConditional: number;
    completedConditional: number;
  };
  completeness: number;
}
