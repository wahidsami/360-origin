/// <reference types="vite/client" />
import { Client, Project, User, CreateUserResult, ResendInviteResult, Finding, Milestone, Role, ClientMember, FileAsset, ActivityLog, ProjectUpdate, EnvironmentAccess, Invoice, Contract, CommentThread, ProjectMember, Report, Task, TaskStatus, Discussion, DiscussionReply, ProjectReadiness, ClientReportTemplateAssignment, ReportBuilderTemplate, ReportBuilderTemplateCategory, ReportBuilderTemplateStatus, ReportBuilderTemplateVersion, ProjectReport, ProjectReportEntry, ProjectReportEntryOutcome, ProjectReportEntrySeverity, ProjectReportEntryStatus, ProjectReportStatus, ProjectReportVisibility, ProjectWorkspaceConfigDraft, ClientWorkspaceTemplateAssignment, ProjectWorkspaceTemplate, WorkspaceAudienceType, WorkspaceTemplateStatus, Org } from '../types';
import toast from 'react-hot-toast';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchApi = async (endpoint: string, options: RequestInit & { silent?: boolean } = {}) => {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const error = text ? JSON.parse(text) : {};
    let message = error.message || 'API Error';
    if (Array.isArray(message)) {
      message = message.join(', ');
    }
    if (!options.silent) {
      toast.error(message);
    }
    throw new Error(message);
  }

  // Handle empty or non-JSON responses
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
};

// Helper to normalize backend task to frontend Task type
const normalizeTask = (t: any): Task => ({
  ...t,
  status: (t.status?.toLowerCase() || 'todo') as TaskStatus,
  priority: (t.priority?.toLowerCase() || 'medium') as any,
  assigneeName: t.assignee?.name || undefined
});

// Helper to normalize backend project to frontend Project type
const normalizeProject = (p: any): Project => ({
  ...p,
  status: (p.status?.toLowerCase().replace('-', '_') || 'planning') as any,
  health: (p.health?.toLowerCase().replace('_', '-') || 'good') as any,
  workspaceConfig: p.workspaceConfig
    ? {
        ...p.workspaceConfig,
        audienceType: (p.workspaceConfig.audienceType?.toLowerCase() || 'client') as any,
      }
    : null,
});

const normalizeWorkspaceTemplate = (template: any): ProjectWorkspaceTemplate => ({
  ...template,
  audienceType: (template.audienceType?.toLowerCase() || 'client') as WorkspaceAudienceType,
});

const normalizeClientWorkspaceTemplateAssignment = (assignment: any): ClientWorkspaceTemplateAssignment => ({
  ...assignment,
  template: normalizeWorkspaceTemplate(assignment.template),
});

// Helper to normalize backend client to frontend Client type
const normalizeClient = (c: any): Client => ({
  ...c,
  status: (c.status?.toLowerCase() || 'active') as any
});

// Helper to normalize backend milestone to frontend Milestone type
const normalizeMilestone = (m: any): Milestone => ({
  ...m,
  status: (m.status?.toLowerCase() || 'pending') as any
});

// Helper to normalize backend finding to frontend Finding type
const normalizeFinding = (f: any): Finding => ({
  ...f,
  status: (f.status?.toLowerCase().replace('-', '_') || 'open') as any,
  severity: (f.severity?.toLowerCase() || 'medium') as any
});

const normalizeFileAsset = (f: any): FileAsset => ({
  id: f.id,
  entityId: f.projectId || f.clientId || f.findingId || f.entityId,
  name: f.filename ?? f.name,
  filename: f.filename ?? f.name,
  category: f.category,
  type: f.mimeType ?? f.type ?? 'application/octet-stream',
  mimeType: f.mimeType ?? f.type ?? 'application/octet-stream',
  size: f.sizeBytes ? `${(f.sizeBytes / 1024 / 1024).toFixed(2)} MB` : (f.size || '0 MB'),
  sizeBytes: f.sizeBytes,
  url: f.url || '',
  uploadedAt: f.uploadedAt ?? f.createdAt,
  uploaderName: f.uploader?.name ?? f.uploaderName ?? 'Unknown',
  visibility: f.visibility,
  scopeType: f.scopeType,
  clientId: f.clientId,
  projectId: f.projectId,
});

const normalizeReport = (report: any): Report => ({
  ...report,
  type: report.type || 'OTHER',
  status: report.status || 'DRAFT',
  generatedBy: report.generatedBy || report.createdBy?.name || undefined,
});

const normalizeProjectReportEntryOutcome = (value: unknown): ProjectReportEntryOutcome => {
  if (value === 'PASS' || value === 'FAIL' || value === 'PARTIAL' || value === 'NOT_APPLICABLE' || value === 'NOT_TESTED') {
    return value;
  }
  return 'FAIL';
};

const normalizeProjectReportEntry = (entry: any): ProjectReportEntry => ({
  ...entry,
  auditOutcome: normalizeProjectReportEntryOutcome(entry?.rowDataJson?.auditOutcome),
});

export type SearchResultItem = { type: 'project' | 'task' | 'client' | 'finding'; id: string; title: string; subtitle?: string; projectId?: string; clientId?: string };

export const api = {
  getBaseUrl: () => API_URL,
  getChangelog: async (): Promise<{ version: string; date: string; changes: string[] }[]> => {
    const res = await fetch(`${API_URL}/changelog`);
    if (!res.ok) return [];
    return res.json();
  },
  public: {
    getOrgBySlug: async (slug: string): Promise<{ name: string; logo: string | null; primaryColor: string | null; accentColor: string | null; slug: string; sso: { saml: boolean; google: boolean } } | null> => {
      const res = await fetch(`${API_URL}/public/org-by-slug/${encodeURIComponent(slug)}`);
      const data = await res.json();
      return data ?? null;
    },
  },
  search: async (q: string, limit = 20): Promise<SearchResultItem[]> => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    return res.json();
  },
  admin: {
    getRoles: async (): Promise<string[]> => Object.values(Role),
  },
  export: {
    findingsCsv: async () => {
      const res = await fetch(`${API_URL}/findings/export`, { headers: getAuthHeader() as Record<string, string> });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'findings.csv'; a.click(); URL.revokeObjectURL(url);
    },
    tasksCsv: async (projectId: string) => {
      const res = await fetch(`${API_URL}/projects/${projectId}/tasks/export`, { headers: getAuthHeader() as Record<string, string> });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'tasks.csv'; a.click(); URL.revokeObjectURL(url);
    },
    invoicesCsv: async (projectId: string) => {
      const res = await fetch(`${API_URL}/projects/${projectId}/invoices/export`, { headers: getAuthHeader() as Record<string, string> });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click(); URL.revokeObjectURL(url);
    },
  },
  org: {
    get: async (): Promise<Org> => fetchApi('/org'),
    create: async (data: { name: string; slug: string; plan?: string; maxUsers?: number; maxProjects?: number; maxStorageMB?: number }) =>
      fetchApi('/org', { method: 'POST', body: JSON.stringify(data) }),
    update: async (data: { name?: string; slug?: string; plan?: string; logo?: string; primaryColor?: string; accentColor?: string; maxUsers?: number; maxProjects?: number; maxStorageMB?: number }) =>
      fetchApi('/org', { method: 'PATCH', body: JSON.stringify(data) }),
    getUsage: async () => fetchApi('/org/usage'),
    getRolePermissions: async (): Promise<Record<Role, string[]>> => fetchApi('/org/role-permissions'),
    updateRolePermissions: async (rolePermissions: Record<Role, string[]>) =>
      fetchApi('/org/role-permissions', { method: 'PATCH', body: JSON.stringify({ rolePermissions }) }),
    getOnboardingStatus: async (): Promise<{ completed: boolean; steps: { profile: boolean; firstProject: boolean; inviteMember: boolean } }> =>
      fetchApi('/org/onboarding-status'),
    dismissOnboarding: async () => fetchApi('/org/onboarding-dismiss', { method: 'PATCH' }),
    getSsoConfigs: async () => fetchApi('/org/sso-config'),
    createSsoConfig: async (data: { provider: string; name: string; enabled?: boolean; clientId?: string; clientSecret?: string; issuer?: string; entryPoint?: string; cert?: string }) =>
      fetchApi('/org/sso-config', { method: 'POST', body: JSON.stringify(data) }),
    updateSsoConfig: async (id: string, data: { name?: string; enabled?: boolean; clientId?: string; clientSecret?: string; issuer?: string; entryPoint?: string; cert?: string }) =>
      fetchApi(`/org/sso-config/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteSsoConfig: async (id: string) => fetchApi(`/org/sso-config/${id}`, { method: 'DELETE' }),
  },
  ai: {
    projectSummary: (projectId: string) => fetchApi('/ai/project/summary', { method: 'POST', body: JSON.stringify({ projectId }) }),
    suggestTasks: (projectId: string) => fetchApi('/ai/project/suggest-tasks', { method: 'POST', body: JSON.stringify({ projectId }) }),
    statusReport: (projectId: string) => fetchApi('/ai/project/status-report', { method: 'POST', body: JSON.stringify({ projectId }) }),
    analyzeFinding: (findingId: string) => fetchApi('/ai/finding/analyze', { method: 'POST', body: JSON.stringify({ findingId }) }),
    chat: (messages: { role: string; content: string }[], context?: { projectId?: string; findingId?: string }) =>
      fetchApi('/ai/chat', { method: 'POST', body: JSON.stringify({ messages, ...context }) }),
  },
  notifications: {
    list: async () => fetchApi('/notifications'),
    count: async () => fetchApi('/notifications/count'),
    markRead: async (id: string) => fetchApi(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: async () => fetchApi('/notifications/read-all', { method: 'PATCH' }),
    getPreferences: async () => fetchApi('/notifications/preferences'),
    updatePreferences: async (prefs: { emailTasks?: boolean; emailFindings?: boolean; emailInvoices?: boolean; inApp?: boolean }) =>
      fetchApi('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(prefs) }),
  },
  automation: {
    listRules: async () => fetchApi('/automation/rules'),
    getRule: async (id: string) => fetchApi(`/automation/rules/${id}`),
    createRule: async (data: { name: string; triggerEntity: string; triggerEvent: string; triggerConditions?: Record<string, any>; actionType?: string; actionConfig: Record<string, any>; isActive?: boolean }) =>
      fetchApi('/automation/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: async (id: string, data: Partial<{ name: string; triggerEntity: string; triggerEvent: string; triggerConditions: Record<string, any>; actionType: string; actionConfig: Record<string, any>; isActive: boolean }>) =>
      fetchApi(`/automation/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteRule: async (id: string) => fetchApi(`/automation/rules/${id}`, { method: 'DELETE' }),
  },
  timeEntries: {
    listByProject: async (projectId: string, from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const suffix = q.toString() ? '?' + q.toString() : '';
      return fetchApi('/projects/' + projectId + '/time-entries' + suffix);
    },
    listByTask: async (projectId: string, taskId: string) => fetchApi(`/projects/${projectId}/tasks/${taskId}/time-entries`),
    listMy: async (from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const suffix = q.toString() ? '?' + q.toString() : '';
      return fetchApi('/time-entries/my' + suffix);
    },
    create: async (projectId: string, data: { taskId: string; minutes: number; date: string; billable?: boolean; note?: string }) =>
      fetchApi(`/projects/${projectId}/time-entries`, { method: 'POST', body: JSON.stringify(data) }),
    update: async (projectId: string, entryId: string, data: { minutes?: number; date?: string; billable?: boolean; note?: string }) =>
      fetchApi(`/projects/${projectId}/time-entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: async (projectId: string, entryId: string) => fetchApi(`/projects/${projectId}/time-entries/${entryId}`, { method: 'DELETE' }),
  },
  auth: {
    login: async (email: string, password?: string): Promise<{ user: User; token: string } | { requires2fa: true; challenge: string }> => {
      const res = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.requires2fa && res.challenge) {
        return { requires2fa: true, challenge: res.challenge };
      }
      localStorage.setItem('auth_token', res.accessToken);
      return { user: res.user, token: res.accessToken };
    },
    verify2faLogin: async (challenge: string, code: string): Promise<{ user: User; token: string }> => {
      const res = await fetchApi('/auth/2fa/verify-login', {
        method: 'POST',
        body: JSON.stringify({ challenge, code }),
      });
      localStorage.setItem('auth_token', res.accessToken);
      return { user: res.user, token: res.accessToken };
    },
    setup2fa: async () => fetchApi('/auth/2fa/setup', { method: 'POST' }),
    verify2faSetup: async (code: string) => fetchApi('/auth/2fa/verify-setup', { method: 'POST', body: JSON.stringify({ code }) }),
    disable2fa: async (password: string) => fetchApi('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) }),
    acceptInvite: async (token: string, password: string): Promise<void> => {
      await fetchApi('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
    },
    forgotPassword: async (email: string): Promise<{ message: string }> => {
      return fetchApi('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },
    resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
      return fetchApi('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
    },
    signupOrg: async (orgName: string, orgSlug: string, adminEmail: string, adminName: string, password: string): Promise<{ user: User; token: string }> => {
      const res = await fetchApi('/auth/signup-org', {
        method: 'POST',
        body: JSON.stringify({ orgName, orgSlug, adminEmail, adminName: adminName || adminEmail.split('@')[0], password }),
      });
      localStorage.setItem('auth_token', res.accessToken);
      return { user: res.user, token: res.accessToken };
    },
    me: async (): Promise<User | null> => {
      try {
        const res = await fetchApi('/auth/me', { silent: true });
        return res.user;
      } catch (e) {
        return null;
      }
    }
  },

  clients: {
    list: async (includeArchived?: boolean): Promise<Client[]> => {
      const qs = includeArchived ? '?includeArchived=true' : '';
      const clients = await fetchApi(`/clients${qs}`);
      return (clients || []).map(normalizeClient);
    },
    get: async (id: string): Promise<Client | undefined> => {
      try {
        const client = await fetchApi(`/clients/${id}`);
        return normalizeClient(client);
      } catch (e) {
        return undefined;
      }
    },
    getFinancialSummary: async (id: string): Promise<{
      openInvoices: number;
      overdueAmount: number;
      totalPaid: number;
      activeContracts: number;
      nextContractEndDate: string | null;
    }> => {
      try {
        return await fetchApi(`/clients/${id}/financial-summary`);
      } catch (e) {
        console.error('Failed to get client financial summary:', e);
        return {
          openInvoices: 0,
          overdueAmount: 0,
          totalPaid: 0,
          activeContracts: 0,
          nextContractEndDate: null,
        };
      }
    },
    create: async (payload: Omit<Client, 'id' | 'revenueYTD' | 'outstandingBalance' | 'lastActivity'>): Promise<Client> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase()
      };
      const client = await fetchApi('/clients', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return normalizeClient(client);
    },
    update: async (id: string, payload: Partial<Client>): Promise<Client | undefined> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase()
      };
      const client = await fetchApi(`/clients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      return normalizeClient(client);
    },
    archive: async (id: string): Promise<void> => {
      await fetchApi(`/clients/${id}/archive`, { method: 'PATCH' });
    },
    restore: async (id: string): Promise<void> => {
      await fetchApi(`/clients/${id}/restore`, { method: 'PATCH' });
    },
    delete: async (id: string): Promise<void> => {
      await fetchApi(`/clients/${id}`, { method: 'DELETE' });
    },
    getMembers: async (clientId: string): Promise<ClientMember[]> => {
      try {
        const members = await fetchApi(`/clients/${clientId}/members`);
        return (members || []).map((m: any) => ({
          id: m.id,
          clientId: m.clientId,
          userId: m.userId,
          name: m.user?.name || 'Unknown',
          role: m.role,
          joinedAt: m.createdAt
        }));
      } catch (e) {
        return [];
      }
    },
    addMember: async (clientId: string, userId: string, role: Role): Promise<ClientMember> => {
      return fetchApi(`/clients/${clientId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role })
      });
    },
    removeMember: async (clientId: string, userId: string): Promise<void> => {
      return fetchApi(`/clients/${clientId}/members/${userId}`, { method: 'DELETE' });
    },
    updateMemberRole: async (clientId: string, userId: string, role: Role): Promise<ClientMember | null> => {
      return fetchApi(`/clients/${clientId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
    },
    getFiles: async (clientId: string): Promise<FileAsset[]> => {
      try {
        const files = await fetchApi(`/clients/${clientId}/files`);
        return (files || []).map(normalizeFileAsset);
      } catch (e) {
        console.error('Failed to get client files:', e);
        return [];
      }
    },
    uploadFile: async (clientId: string, file: File, category: string, visibility?: string): Promise<FileAsset | undefined> => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        if (visibility) formData.append('visibility', visibility);

        const response = await fetch(`${API_URL}/clients/${clientId}/files`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        if (!response.ok) throw new Error('Upload failed');
        return await response.json();
      } catch (e) {
        console.error('Failed to upload file:', e);
        return undefined;
      }
    },
    downloadFile: async (clientId: string, fileId: string, download: boolean = true): Promise<string | undefined> => {
      try {
        const mode = download ? 'download' : 'view';
        const result = await fetchApi(`/clients/${clientId}/files/${fileId}/${mode}`);
        return result.url; // Returns signed URL
      } catch (e) {
        console.error('Failed to get file URL:', e);
        return undefined;
      }
    },
    getActivity: async (clientId: string): Promise<ActivityLog[]> => {
      try {
        return await fetchApi(`/clients/${clientId}/activity`);
      } catch (e) {
        console.error('Failed to get client activity:', e);
        return [];
      }
    },
    logActivity: async (entityId: string, action: string, description: string, userId: string, userName: string) => {
      console.debug('Client activity logging helper is not currently used.', {
        entityId,
        action,
        description,
        userId,
        userName,
      });
    },
    getMyClient: async (userId: string): Promise<Client | undefined> => {
      try {
        const res = await fetchApi('/clients');
        return (res || [])[0]; // Client users only see their own client
      } catch (e) {
        return undefined;
      }
    }
  },

  projects: {
    list: async (): Promise<Project[]> => {
      const projects = await fetchApi('/projects');
      return (projects || []).map(normalizeProject);
    },
    getByClient: async (clientId: string): Promise<Project[]> => {
      const projects = await fetchApi(`/projects?clientId=${clientId}`);
      return (projects || []).map(normalizeProject);
    },
    get: async (id: string): Promise<Project | undefined> => {
      try {
        const project = await fetchApi(`/projects/${id}`);
        return normalizeProject(project);
      } catch (e) {
        return undefined;
      }
    },
    getReadiness: async (id: string): Promise<ProjectReadiness> => {
      return fetchApi(`/projects/${id}/readiness`);
    },
    getMetrics: async (id: string) => fetchApi(`/projects/${id}/metrics`),
    create: async (payload: Omit<Project, 'id'> & { workspaceConfigDraft?: ProjectWorkspaceConfigDraft }): Promise<Project> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase().replace('-', '_')
      };
      const project = await fetchApi('/projects', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return normalizeProject(project);
    },
    update: async (id: string, payload: Partial<Project> & { workspaceConfigDraft?: ProjectWorkspaceConfigDraft }): Promise<Project | undefined> => {
        try {
          const body = {
            ...payload,
          status: payload.status?.toUpperCase().replace('-', '_')
        };
        const project = await fetchApi(`/projects/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        return normalizeProject(project);
      } catch (e) {
        console.error('Failed to update project:', e);
        return undefined;
      }
    },
    archive: async (id: string): Promise<void> => {
      await fetchApi(`/projects/${id}/archive`, { method: 'PATCH' });
    },
    delete: async (id: string): Promise<void> => {
      await fetchApi(`/projects/${id}`, { method: 'DELETE' });
    },
    getMilestones: async (projectId: string): Promise<Milestone[]> => {
      try {
        const milestones = await fetchApi(`/projects/${projectId}/milestones`);
        return (milestones || []).map(normalizeMilestone);
      } catch (e) {
        console.error('Failed to get milestones:', e);
        return [];
      }
    },
    upsertMilestone: async (milestone: Partial<Milestone>): Promise<Milestone | undefined> => {
      try {
        const { projectId, id } = milestone;
        if (!projectId) throw new Error('ProjectId is required');

        // Whitelist only allowed DTO fields to prevent 400 errors from metadata
        const body = {
          title: milestone.title,
          description: milestone.description,
          status: milestone.status?.toUpperCase(),
          percentComplete: milestone.percentComplete,
          dueDate: milestone.dueDate,
          ownerId: milestone.ownerId === '' ? null : milestone.ownerId
        };

        if (id) {
          // Update existing
          const m = await fetchApi(`/projects/${projectId}/milestones/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body)
          });
          return normalizeMilestone(m);
        } else {
          // Create new
          const m = await fetchApi(`/projects/${projectId}/milestones`, {
            method: 'POST',
            body: JSON.stringify(body)
          });
          return normalizeMilestone(m);
        }
      } catch (e) {
        console.error('Failed to upsert milestone:', e);
        return undefined;
      }
    },
    deleteMilestone: async (projectId: string, id: string): Promise<void> => {
      try {
        await fetchApi(`/projects/${projectId}/milestones/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete milestone:', e);
      }
    },
    getUpdates: async (projectId: string): Promise<ProjectUpdate[]> => {
      try {
        const updates = await fetchApi(`/projects/${projectId}/updates`);
        return (updates || []).map((u: any) => ({
          ...u,
          timestamp: u.createdAt,
          authorName: u.author?.name || 'Unknown'
        }));
      } catch (e) {
        console.error('Failed to get updates:', e);
        return [];
      }
    },
    createUpdate: async (projectId: string, update: Partial<ProjectUpdate>): Promise<ProjectUpdate | undefined> => {
      try {
        if (!projectId) throw new Error('ProjectId is required');

        // Whitelist and normalize fields for the backend DTO
        const body = {
          title: update.title,
          content: update.content,
          visibility: update.visibility ? (update.visibility.toUpperCase() as any) : 'INTERNAL'
        };

        return await fetchApi(`/projects/${projectId}/updates`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      } catch (e) {
        console.error('Failed to create update:', e);
        return undefined;
      }
    },
    getEnvironments: async (projectId: string): Promise<EnvironmentAccess[]> => {
      try {
        const environments = await fetchApi(`/projects/${projectId}/environments`);
        return (environments || []).map((environment: any) => ({
          ...environment,
          credentials: environment.credentials?.username
            ? { username: environment.credentials.username }
            : undefined,
        }));
      } catch (e) {
        console.error('Failed to get environments:', e);
        return [];
      }
    },
    createEnvironment: async (projectId: string, payload: { name: string; url: string; username?: string | null }): Promise<EnvironmentAccess | undefined> => {
      try {
        return await fetchApi(`/projects/${projectId}/environments`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error('Failed to create environment:', e);
        return undefined;
      }
    },
    updateEnvironment: async (projectId: string, environmentId: string, payload: { name?: string; url?: string; username?: string | null }): Promise<EnvironmentAccess | undefined> => {
      try {
        return await fetchApi(`/projects/${projectId}/environments/${environmentId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error('Failed to update environment:', e);
        return undefined;
      }
    },
    deleteEnvironment: async (projectId: string, environmentId: string): Promise<void> => {
      await fetchApi(`/projects/${projectId}/environments/${environmentId}`, { method: 'DELETE' });
    },
    getFinancials: async (projectId: string): Promise<{ contract?: Contract, invoices: Invoice[] }> => {
      // Fetch both contracts and invoices in parallel
      try {
        const [contracts, invoices] = await Promise.all([
          fetchApi(`/projects/${projectId}/contracts`).catch(() => []),
          fetchApi(`/projects/${projectId}/invoices`).catch(() => [])
        ]);
        return {
          contract: contracts[0],
          invoices
        };
      } catch (e) {
        console.error("Failed to load financials", e);
        return { contract: undefined, invoices: [] };
      }
    },
    getContracts: async (projectId: string): Promise<Contract[]> => {
      try {
        return await fetchApi(`/projects/${projectId}/contracts`);
      } catch (e) {
        return [];
      }
    },
    createContract: async (projectId: string, payload: any): Promise<Contract> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase()
      };
      return fetchApi(`/projects/${projectId}/contracts`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    updateContract: async (projectId: string, contractId: string, payload: any): Promise<Contract> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase()
      };
      return fetchApi(`/projects/${projectId}/contracts/${contractId}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
    },
    deleteContract: async (projectId: string, contractId: string): Promise<void> => {
      return fetchApi(`/projects/${projectId}/contracts/${contractId}`, { method: 'DELETE' });
    },
    getInvoices: async (projectId: string): Promise<Invoice[]> => {
      try {
        return await fetchApi(`/projects/${projectId}/invoices`);
      } catch (e) {
        return [];
      }
    },
    createInvoice: async (projectId: string, payload: any): Promise<Invoice> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase()
      };
      return fetchApi(`/projects/${projectId}/invoices`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    updateInvoice: async (projectId: string, invoiceId: string, payload: any): Promise<Invoice> => {
      const body = {
        ...payload,
        status: payload.status?.toUpperCase()
      };
      return fetchApi(`/projects/${projectId}/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
    },
    deleteInvoice: async (projectId: string, invoiceId: string): Promise<void> => {
      return fetchApi(`/projects/${projectId}/invoices/${invoiceId}`, { method: 'DELETE' });
    },
    getInvoice: async (projectId: string, invoiceId: string): Promise<Invoice> => {
      return fetchApi(`/projects/${projectId}/invoices/${invoiceId}`);
    },
    createPaymentIntent: async (projectId: string, invoiceId: string): Promise<{ clientSecret: string }> => {
      return fetchApi(`/projects/${projectId}/invoices/${invoiceId}/create-payment-intent`, { method: 'POST' });
    },
    getActivity: async (projectId: string): Promise<ActivityLog[]> => {
      const list = await fetchApi(`/projects/${projectId}/activity`);
      return (list || []).map((a: any) => ({
        id: a.id,
        entityId: a.entityId,
        action: a.action,
        description: a.description,
        userId: a.userId,
        userName: a.userName,
        timestamp: a.timestamp,
        type: a.type,
      }));
    },
    getFiles: async (projectId: string): Promise<FileAsset[]> => {
      try {
        const files = await fetchApi(`/projects/${projectId}/files`);
        return (files || []).map(normalizeFileAsset);
      } catch (e) {
        console.error('Failed to get project files:', e);
        return [];
      }
    },
    uploadFile: async (projectId: string, file: File, category: string, visibility?: string, displayName?: string): Promise<FileAsset | undefined> => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        if (visibility) formData.append('visibility', visibility);
        if (displayName) formData.append('displayName', displayName);

        const response = await fetch(`${API_URL}/projects/${projectId}/files`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData // Don't set Content-Type, browser will set multipart/form-data
        });

        if (!response.ok) throw new Error('Upload failed');
        return await response.json();
      } catch (e) {
        console.error('Failed to upload file:', e);
        return undefined;
      }
    },
    downloadFile: async (projectId: string, fileId: string, download: boolean = true): Promise<string | undefined> => {
      try {
        const mode = download ? 'download' : 'view';
        const result = await fetchApi(`/projects/${projectId}/files/${fileId}/${mode}`);
        return result.url; // Returns signed URL
      } catch (e) {
        console.error('Failed to get file URL:', e);
        return undefined;
      }
    },
    deleteFile: async (projectId: string, fileId: string): Promise<boolean> => {
      try {
        await fetchApi(`/projects/${projectId}/files/${fileId}`, { method: 'DELETE' });
        return true;
      } catch (e) {
        console.error('Failed to delete file:', e);
        return false;
      }
    },
    // === DISCUSSIONS ===
    getDiscussions: async (projectId: string): Promise<Discussion[]> => {
      try {
        return await fetchApi(`/projects/${projectId}/discussions`);
      } catch (e) {
        console.error('Failed to get discussions:', e);
        return [];
      }
    },
    createDiscussion: async (projectId: string, title: string, body: string, clientRequestId?: string): Promise<Discussion | undefined> => {
      try {
        return await fetchApi(`/projects/${projectId}/discussions`, {
          method: 'POST',
          body: JSON.stringify({ title, body, clientRequestId })
        });
      } catch (e) {
        console.error('Failed to create discussion:', e);
        return undefined;
      }
    },
    getReplies: async (projectId: string, discussionId: string): Promise<DiscussionReply[]> => {
      try {
        return await fetchApi(`/projects/${projectId}/discussions/${discussionId}/replies`);
      } catch (e) {
        console.error('Failed to get replies:', e);
        return [];
      }
    },
    createReply: async (projectId: string, discussionId: string, body: string, clientRequestId?: string): Promise<DiscussionReply | undefined> => {
      try {
        return await fetchApi(`/projects/${projectId}/discussions/${discussionId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ body, clientRequestId })
        });
      } catch (e) {
        console.error('Failed to create reply:', e);
        return undefined;
      }
    },
    deleteDiscussion: async (projectId: string, discussionId: string): Promise<boolean> => {
      try {
        await fetchApi(`/projects/${projectId}/discussions/${discussionId}`, { method: 'DELETE' });
        return true;
      } catch (e) {
        console.error('Failed to delete discussion:', e);
        return false;
      }
    },
    deleteReply: async (projectId: string, discussionId: string, replyId: string): Promise<boolean> => {
      try {
        await fetchApi(`/projects/${projectId}/discussions/${discussionId}/replies/${replyId}`, { method: 'DELETE' });
        return true;
      } catch (e) {
        console.error('Failed to delete reply:', e);
        return false;
      }
    },
    getMembers: async (projectId: string): Promise<ProjectMember[]> => {
      try {
        const members = await fetchApi(`/projects/${projectId}/members`);
        return (members || []).map((m: any) => ({
          id: m.id,
          projectId: m.projectId,
          userId: m.userId,
          name: m.user?.name || 'Unknown',
          role: m.role,
          joinedAt: m.createdAt
        }));
      } catch (e) {
        return [];
      }
    },
    addMember: async (projectId: string, userId: string, role: Role): Promise<ProjectMember> => {
      return fetchApi(`/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role })
      });
    },
    removeMember: async (projectId: string, userId: string): Promise<void> => {
      return fetchApi(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
    },
    updateMemberRole: async (projectId: string, userId: string, role: Role): Promise<ProjectMember | null> => {
      return fetchApi(`/projects/${projectId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
    },
    getFindings: async (projectId: string): Promise<Finding[]> => {
      try {
        const findings = await fetchApi(`/projects/${projectId}/findings`);
        return (findings || []).map(normalizeFinding);
      } catch (e) {
        console.error('Failed to get findings:', e);
        return [];
      }
    },
    createFinding: async (projectId: string, finding: Partial<Finding>): Promise<Finding | undefined> => {
      const body = {
        ...finding,
        status: finding.status?.toUpperCase().replace('-', '_'),
        severity: finding.severity?.toUpperCase()
      };
      try {
        const f = await fetchApi(`/projects/${projectId}/findings`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        return normalizeFinding(f);
      } catch (e) {
        console.error('Failed to create finding:', e);
        return undefined;
      }
    },
    updateFinding: async (projectId: string, id: string, finding: Partial<Finding>): Promise<Finding | undefined> => {
      const body = {
        ...finding,
        status: finding.status?.toUpperCase().replace('-', '_'),
        severity: finding.severity?.toUpperCase()
      };
      try {
        const f = await fetchApi(`/projects/${projectId}/findings/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        return normalizeFinding(f);
      } catch (e) {
        console.error('Failed to update finding:', e);
        return undefined;
      }
    },
    deleteFinding: async (projectId: string, id: string): Promise<void> => {
      try {
        await fetchApi(`/projects/${projectId}/findings/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete finding:', e);
      }
    },
    getReports: async (projectId: string): Promise<Report[]> => {
      try {
        const reports = await fetchApi(`/projects/${projectId}/reports`);
        return (reports || []).map(normalizeReport);
      } catch (e) {
        console.error('Failed to get reports:', e);
        return [];
      }
    },
    createReport: async (projectId: string, report: Partial<Report>): Promise<Report | undefined> => {
      try {
        const created = await fetchApi(`/projects/${projectId}/reports`, {
          method: 'POST',
          body: JSON.stringify(report)
        });
        return normalizeReport(created);
      } catch (e) {
        console.error('Failed to create report:', e);
        return undefined;
      }
    },
    updateReport: async (projectId: string, id: string, report: Partial<Report>): Promise<Report | undefined> => {
      try {
        const updated = await fetchApi(`/projects/${projectId}/reports/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(report)
        });
        return normalizeReport(updated);
      } catch (e) {
        console.error('Failed to update report:', e);
        return undefined;
      }
    },
    deleteReport: async (projectId: string, id: string): Promise<void> => {
      try {
        await fetchApi(`/projects/${projectId}/reports/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete report:', e);
      }
    },
    uploadReportFile: async (projectId: string, reportId: string, file: File): Promise<Report | undefined> => {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_URL}/projects/${projectId}/reports/${reportId}/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        if (!response.ok) throw new Error('Upload failed');
        return normalizeReport(await response.json());
      } catch (e) {
        console.error('Failed to upload report file:', e);
        return undefined;
      }
    },
    generateReport: async (projectId: string, options: { reportId?: string; format: 'pptx' | 'pdf' }) => {
      return fetchApi(`/projects/${projectId}/reports/generate`, {
        method: 'POST',
        body: JSON.stringify({ reportId: options.reportId, format: options.format }),
      });
    },
    downloadReport: async (projectId: string, reportId: string, filename: string) => {
      const res = await fetch(`${API_URL}/projects/${projectId}/reports/${reportId}/download`, {
        headers: getAuthHeader() as Record<string, string>,
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    },
    getTasks: async (projectId: string): Promise<Task[]> => {
      const tasks = await fetchApi(`/projects/${projectId}/tasks`);
      return (tasks || []).map(normalizeTask);
    },
    createTask: async (projectId: string, payload: Partial<Task>): Promise<Task> => {
      // Normalize to uppercase for backend
      const body = {
        ...payload,
        status: payload.status?.toUpperCase(),
        priority: payload.priority?.toUpperCase()
      };
      const task = await fetchApi(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return normalizeTask(task);
    },
    updateTask: async (projectId: string, taskId: string, payload: Partial<Task>): Promise<Task | null> => {
      // Stripping relational objects that cause 400 errors in backend ValidationPipe
      const {
        milestone,
        sprint,
        assignee,
        assignedTo,
        project,
        reportedBy,
        _count,
        dependencies,
        assigneeName,
        createdAt,
        updatedAt,
        deletedAt,
        ...validPayload
      } = payload as any;

      // Normalize to uppercase for backend
      const body = {
        ...validPayload,
        status: validPayload.status?.toUpperCase(),
        priority: validPayload.priority?.toUpperCase()
      };
      const task = await fetchApi(`/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      return normalizeTask(task);
    },
    deleteTask: async (projectId: string, taskId: string): Promise<void> => {
      await fetchApi(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' });
    },
    moveTaskStatus: async (projectId: string, taskId: string, status: TaskStatus): Promise<Task | null> => {
      return api.projects.updateTask(projectId, taskId, { status });
    },
    getTaskDependencies: async (projectId: string) => fetchApi(`/projects/${projectId}/task-dependencies`),
    addTaskDependency: async (projectId: string, predecessorTaskId: string, successorTaskId: string) =>
      fetchApi(`/projects/${projectId}/task-dependencies`, { method: 'POST', body: JSON.stringify({ predecessorTaskId, successorTaskId }) }),
    removeTaskDependency: async (projectId: string, dependencyId: string) =>
      fetchApi(`/projects/${projectId}/task-dependencies/${dependencyId}`, { method: 'DELETE' }),
    getSprints: async (projectId: string) => fetchApi(`/projects/${projectId}/sprints`),
    getSprint: async (projectId: string, sprintId: string) => fetchApi(`/projects/${projectId}/sprints/${sprintId}`),
    getSprintTasks: async (projectId: string, sprintId: string) => fetchApi(`/projects/${projectId}/sprints/${sprintId}/tasks`),
    getBacklogTasks: async (projectId: string) => fetchApi(`/projects/${projectId}/backlog/tasks`),
    createSprint: async (projectId: string, data: { name: string; goal?: string; startDate: string; endDate: string; status?: string }) =>
      fetchApi(`/projects/${projectId}/sprints`, { method: 'POST', body: JSON.stringify(data) }),
    updateSprint: async (projectId: string, sprintId: string, data: Partial<{ name: string; goal: string; startDate: string; endDate: string; status: string }>) =>
      fetchApi(`/projects/${projectId}/sprints/${sprintId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteSprint: async (projectId: string, sprintId: string) =>
      fetchApi(`/projects/${projectId}/sprints/${sprintId}`, { method: 'DELETE' }),
    getRecurringTasks: async (projectId: string) =>
      fetchApi(`/projects/${projectId}/recurring-tasks`),
    createRecurringTask: async (projectId: string, payload: { title: string; description?: string; priority?: string; recurrenceRule: { frequency: string; interval?: number; weekday?: number }; nextRunAt?: string }) =>
      fetchApi(`/projects/${projectId}/recurring-tasks`, { method: 'POST', body: JSON.stringify(payload) }),
    updateRecurringTask: async (projectId: string, templateId: string, payload: Partial<{ title: string; description: string; priority: string; recurrenceRule: object; nextRunAt: string; isActive: boolean }>) =>
      fetchApi(`/projects/${projectId}/recurring-tasks/${templateId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteRecurringTask: async (projectId: string, templateId: string) =>
      fetchApi(`/projects/${projectId}/recurring-tasks/${templateId}`, { method: 'DELETE' }),
  },

  tasks: {
    getMyTasks: async (userId: string): Promise<Task[]> => {
      const tasks = await fetchApi('/tasks/my');
      return (tasks || []).map(normalizeTask);
    }
  },

  findings: {
    list: async (): Promise<Finding[]> => {
      try {
        const findings = await fetchApi('/findings');
        return (findings || []).map(normalizeFinding);
      } catch (e) {
        console.error('Failed to get findings:', e);
        return [];
      }
    },
    get: async (id: string): Promise<Finding | undefined> => {
      try {
        const finding = await fetchApi(`/findings/${id}`);
        return normalizeFinding(finding);
      } catch (e) {
        console.error('Failed to get finding:', e);
        return undefined;
      }
    },
    update: async (projectId: string, findingId: string, data: any): Promise<Finding | undefined> => {
      const body = {
        ...data,
        status: data.status?.toUpperCase().replace('-', '_'),
        severity: data.severity?.toUpperCase()
      };
      try {
        const f = await fetchApi(`/projects/${projectId}/findings/${findingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        return normalizeFinding(f);
      } catch (e) {
        console.error('Failed to update finding:', e);
        return undefined;
      }
    },
    getComments: async (id: string): Promise<any[]> => {
      try {
        return await fetchApi(`/findings/${id}/comments`);
      } catch (e) {
        console.error('Failed to get comments:', e);
        return [];
      }
    },
    createComment: async (id: string, comment: { content: string, parentId?: string }): Promise<any | undefined> => {
      try {
        return await fetchApi(`/findings/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify(comment)
        });
      } catch (e) {
        console.error('Failed to create comment:', e);
        return undefined;
      }
    },
    getFiles: async (findingId: string): Promise<FileAsset[]> => {
      try {
        const files = await fetchApi(`/findings/${findingId}/files`);
        return (files || []).map(normalizeFileAsset);
      } catch (e) {
        console.error('Failed to get finding files:', e);
        return [];
      }
    },
    uploadFile: async (findingId: string, file: File, visibility?: string): Promise<FileAsset | undefined> => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'EVIDENCE');
        if (visibility) formData.append('visibility', visibility);

        const response = await fetch(`${API_URL}/findings/${findingId}/files`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        if (!response.ok) throw new Error('Upload failed');
        return await response.json();
      } catch (e) {
        console.error('Failed to upload finding file:', e);
        return undefined;
      }
    },
    downloadFile: async (findingId: string, fileId: string, download: boolean = true): Promise<string | undefined> => {
      try {
        const mode = download ? 'download' : 'view';
        const result = await fetchApi(`/findings/${findingId}/files/${fileId}/${mode}`);
        return result.url;
      } catch (e) {
        console.error('Failed to get file URL:', e);
        return undefined;
      }
    },
    deleteFile: async (findingId: string, fileId: string): Promise<boolean> => {
      try {
        await fetchApi(`/findings/${findingId}/files/${fileId}`, { method: 'DELETE' });
        return true;
      } catch (e) {
        console.error('Failed to delete finding file:', e);
        return false;
      }
    },

    // Contracts
    getContracts: async (projectId: string) => {
      try {
        return await fetchApi(`/projects/${projectId}/contracts`);
      } catch (e) {
        console.error('Failed to get contracts:', e);
        return [];
      }
    },
    createContract: async (projectId: string, contract: any) => {
      try {
        return await fetchApi(`/projects/${projectId}/contracts`, {
          method: 'POST',
          body: JSON.stringify(contract)
        });
      } catch (e) {
        console.error('Failed to create contract:', e);
        return undefined;
      }
    },
    updateContract: async (projectId: string, id: string, contract: any) => {
      try {
        return await fetchApi(`/projects/${projectId}/contracts/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(contract)
        });
      } catch (e) {
        console.error('Failed to update contract:', e);
        return undefined;
      }
    },
    deleteContract: async (projectId: string, id: string) => {
      try {
        await fetchApi(`/projects/${projectId}/contracts/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete contract:', e);
      }
    },

    // Invoices
    getInvoices: async (projectId: string) => {
      try {
        return await fetchApi(`/projects/${projectId}/invoices`);
      } catch (e) {
        console.error('Failed to get invoices:', e);
        return [];
      }
    },
    createInvoice: async (projectId: string, invoice: any) => {
      try {
        return await fetchApi(`/projects/${projectId}/invoices`, {
          method: 'POST',
          body: JSON.stringify(invoice)
        });
      } catch (e) {
        console.error('Failed to create invoice:', e);
        return undefined;
      }
    },
    updateInvoice: async (projectId: string, id: string, invoice: any) => {
      try {
        return await fetchApi(`/projects/${projectId}/invoices/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(invoice)
        });
      } catch (e) {
        console.error('Failed to update invoice:', e);
        return undefined;
      }
    },
    deleteInvoice: async (projectId: string, id: string) => {
      try {
        await fetchApi(`/projects/${projectId}/invoices/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete invoice:', e);
      }
    }
  },

  reports: {
    list: async (): Promise<Report[]> => {
      const reports = await fetchApi('/reports');
      return (reports || []).map(normalizeReport);
    }
  },

  approvals: {
    create: async (dto: { entityType: 'REPORT' | 'INVOICE' | 'CONTRACT'; entityId: string; projectId?: string }) =>
      fetchApi('/approvals', { method: 'POST', body: JSON.stringify(dto) }),
    getByEntity: async (entityType: 'REPORT' | 'INVOICE' | 'CONTRACT', entityId: string) =>
      fetchApi(`/approvals/entity/${entityType}/${entityId}`),
    getLatestForEntity: async (entityType: 'REPORT' | 'INVOICE' | 'CONTRACT', entityId: string) => {
      try {
        return await fetchApi(`/approvals/entity/${entityType}/${entityId}/latest`);
      } catch {
        return null;
      }
    },
    listByProject: async (projectId: string) =>
      fetchApi(`/approvals/project/${projectId}`),
    listPending: async () => fetchApi('/approvals/pending'),
    approve: async (id: string, comment?: string) =>
      fetchApi(`/approvals/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ comment }) }),
    reject: async (id: string, comment?: string) =>
      fetchApi(`/approvals/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ comment }) }),
  },

  integrations: {
    list: async () => fetchApi('/integrations'),
    create: async (dto: { type: 'SLACK' | 'GITHUB'; name: string; enabled?: boolean; config: Record<string, unknown> }) =>
      fetchApi('/integrations', { method: 'POST', body: JSON.stringify(dto) }),
    update: async (id: string, dto: { name?: string; enabled?: boolean; config?: Record<string, unknown> }) =>
      fetchApi(`/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    delete: async (id: string) => fetchApi(`/integrations/${id}`, { method: 'DELETE' }),
    testSlack: async (id: string) => fetchApi(`/integrations/${id}/test-slack`, { method: 'POST' }),
    createGitHubIssue: async (id: string, title: string, body?: string) =>
      fetchApi(`/integrations/${id}/github-issue`, { method: 'POST', body: JSON.stringify({ title, body }) }),
  },
  webhooks: {
    list: async () => fetchApi('/integrations/webhooks'),
    create: async (dto: { name: string; url: string; secret?: string; events?: string[]; enabled?: boolean }) =>
      fetchApi('/integrations/webhooks', { method: 'POST', body: JSON.stringify(dto) }),
    update: async (id: string, dto: { name?: string; url?: string; secret?: string; events?: string[]; enabled?: boolean }) =>
      fetchApi(`/integrations/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    delete: async (id: string) => fetchApi(`/integrations/webhooks/${id}`, { method: 'DELETE' }),
  },

  customFields: {
    listDefs: async (entityType?: 'PROJECT' | 'TASK' | 'CLIENT') => {
      const q = entityType ? `?entityType=${entityType}` : '';
      return fetchApi(`/custom-fields/defs${q}`);
    },
    createDef: async (dto: { entityType: 'PROJECT' | 'TASK' | 'CLIENT'; key: string; label: string; fieldType: string; options?: unknown; required?: boolean; sortOrder?: number }) =>
      fetchApi('/custom-fields/defs', { method: 'POST', body: JSON.stringify(dto) }),
    updateDef: async (id: string, dto: { label?: string; fieldType?: string; options?: unknown; required?: boolean; sortOrder?: number }) =>
      fetchApi(`/custom-fields/defs/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    deleteDef: async (id: string) => fetchApi(`/custom-fields/defs/${id}`, { method: 'DELETE' }),
    getValues: async (entityType: 'PROJECT' | 'TASK' | 'CLIENT', entityId: string) =>
      fetchApi(`/custom-fields/values/${entityType}/${entityId}`),
    setValues: async (entityType: 'PROJECT' | 'TASK' | 'CLIENT', entityId: string, values: Record<string, string | number | boolean | null>) =>
      fetchApi(`/custom-fields/values/${entityType}/${entityId}`, { method: 'PATCH', body: JSON.stringify({ values }) }),
  },

  sla: {
    listPolicies: async (entityType?: 'TASK' | 'FINDING' | 'INVOICE') => {
      const q = entityType ? `?entityType=${entityType}` : '';
      return fetchApi(`/sla/policies${q}`);
    },
    createPolicy: async (dto: { name: string; entityType: 'TASK' | 'FINDING' | 'INVOICE'; targetHours: number; clientId?: string; enabled?: boolean }) =>
      fetchApi('/sla/policies', { method: 'POST', body: JSON.stringify(dto) }),
    updatePolicy: async (id: string, dto: { name?: string; targetHours?: number; clientId?: string; enabled?: boolean }) =>
      fetchApi(`/sla/policies/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    deletePolicy: async (id: string) => fetchApi(`/sla/policies/${id}`, { method: 'DELETE' }),
    listTrackers: async (params?: { policyId?: string; entityType?: string; entityId?: string; status?: string }) => {
      const sp = new URLSearchParams();
      if (params?.policyId) sp.set('policyId', params.policyId);
      if (params?.entityType) sp.set('entityType', params.entityType);
      if (params?.entityId) sp.set('entityId', params.entityId);
      if (params?.status) sp.set('status', params.status);
      const q = sp.toString() ? `?${sp}` : '';
      return fetchApi(`/sla/trackers${q}`);
    },
    checkBreaches: async () => fetchApi('/sla/check-breaches', { method: 'POST' }),
  },

  wiki: {
    listPages: async () => fetchApi('/wiki/pages'),
    getBySlug: async (slug: string) => fetchApi(`/wiki/pages/slug/${encodeURIComponent(slug)}`),
    getById: async (id: string) => fetchApi(`/wiki/pages/${id}`),
    create: async (dto: { slug: string; title: string; body: string }) =>
      fetchApi('/wiki/pages', { method: 'POST', body: JSON.stringify(dto) }),
    update: async (id: string, dto: { slug?: string; title?: string; body?: string }) =>
      fetchApi(`/wiki/pages/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    delete: async (id: string) => fetchApi(`/wiki/pages/${id}`, { method: 'DELETE' }),
    getVersions: async (pageId: string) => fetchApi(`/wiki/pages/${pageId}/versions`),
  },

  analytics: {
    get: async () => fetchApi('/dashboard/analytics'),
  },

  // Dashboard financial stats
  getFinancialStats: async () => {
    try {
      return await fetchApi('/dashboard/financial-stats');
    } catch (e) {
      console.error('Failed to get financial stats:', e);
      return { totalOutstanding: 0, totalOverdue: 0, totalPaid: 0, invoiceCount: 0 };
    }
  },

  users: {
    list: async (): Promise<User[]> => {
      return fetchApi('/admin/users');
    },
    create: async (payload: Partial<User> & { password?: string; permissions?: string[] }): Promise<CreateUserResult> => {
      return fetchApi('/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    update: async (userId: string, payload: Partial<User> & { password?: string; permissions?: string[] }): Promise<User> => {
      return fetchApi(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    },
    updatePermissions: async (userId: string, permissions: string[]): Promise<User> => {
      return fetchApi(`/admin/users/${userId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions })
      });
    },
    delete: async (userId: string): Promise<void> => {
      await fetchApi(`/admin/users/${userId}`, {
        method: 'DELETE'
      });
    },
    resendInvite: async (userId: string): Promise<ResendInviteResult> => {
      return fetchApi(`/admin/users/${userId}/resend-invite`, {
        method: 'POST'
      });
    },
  },

  reportBuilderAdmin: {
    listTemplates: async (): Promise<ReportBuilderTemplate[]> => {
      return fetchApi('/admin/report-builder/templates');
    },
    createTemplate: async (payload: {
      name: string;
      code: string;
      description?: string;
      category?: ReportBuilderTemplateCategory;
      status?: ReportBuilderTemplateStatus;
    }): Promise<ReportBuilderTemplate> => {
      return fetchApi('/admin/report-builder/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    updateTemplate: async (
      templateId: string,
      payload: Partial<{
        name: string;
        code: string;
        description: string;
        category: ReportBuilderTemplateCategory;
        status: ReportBuilderTemplateStatus;
      }>,
    ): Promise<ReportBuilderTemplate> => {
      return fetchApi(`/admin/report-builder/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    createTemplateVersion: async (
      templateId: string,
      payload: {
        schemaJson: Record<string, unknown>;
        pdfConfigJson?: Record<string, unknown>;
        aiConfigJson?: Record<string, unknown>;
        taxonomyJson?: Record<string, unknown>;
      },
    ): Promise<ReportBuilderTemplateVersion> => {
      return fetchApi(`/admin/report-builder/templates/${templateId}/versions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    publishTemplateVersion: async (
      templateId: string,
      versionId: string,
    ): Promise<ReportBuilderTemplateVersion> => {
      return fetchApi(`/admin/report-builder/templates/${templateId}/versions/${versionId}/publish`, {
        method: 'POST',
      });
    },
    getTemplateVersionSamplePreview: async (templateId: string, versionId: string, locale: 'en' | 'ar' = 'en'): Promise<string> => {
      const res = await fetchApi(
        `/admin/report-builder/templates/${templateId}/versions/${versionId}/sample-preview?locale=${locale}`,
      );
      return res.html || '';
    },
    listClientAssignments: async (clientId: string): Promise<ClientReportTemplateAssignment[]> => {
      return fetchApi(`/admin/report-builder/clients/${clientId}/assignments`);
    },
    createClientAssignment: async (
      clientId: string,
      payload: {
        templateId: string;
        templateVersionId: string;
        isDefault?: boolean;
        isActive?: boolean;
      },
    ): Promise<ClientReportTemplateAssignment> => {
      return fetchApi(`/admin/report-builder/clients/${clientId}/assignments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    updateClientAssignment: async (
      assignmentId: string,
      payload: { isDefault?: boolean; isActive?: boolean },
    ): Promise<ClientReportTemplateAssignment> => {
      return fetchApi(`/admin/report-builder/client-assignments/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
  },

  workspaceTemplatesAdmin: {
    listTemplates: async (): Promise<ProjectWorkspaceTemplate[]> => {
      const templates = await fetchApi('/admin/project-workspaces/templates');
      return (templates || []).map(normalizeWorkspaceTemplate);
    },
    createTemplate: async (payload: {
      name: string;
      description?: string;
      audienceType?: WorkspaceAudienceType;
      status?: WorkspaceTemplateStatus;
      isDefault?: boolean;
      definitionJson: Record<string, unknown>;
    }): Promise<ProjectWorkspaceTemplate> => {
      const body = {
        ...payload,
        audienceType: payload.audienceType?.toUpperCase(),
        status: payload.status?.toUpperCase(),
      };
      const template = await fetchApi('/admin/project-workspaces/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return normalizeWorkspaceTemplate(template);
    },
    updateTemplate: async (
      templateId: string,
      payload: Partial<{
        name: string;
        description: string;
        audienceType: WorkspaceAudienceType;
        status: WorkspaceTemplateStatus;
        isDefault: boolean;
        definitionJson: Record<string, unknown>;
      }>,
    ): Promise<ProjectWorkspaceTemplate> => {
      const body = {
        ...payload,
        audienceType: payload.audienceType?.toUpperCase(),
        status: payload.status?.toUpperCase(),
      };
      const template = await fetchApi(`/admin/project-workspaces/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return normalizeWorkspaceTemplate(template);
    },
    listClientAssignments: async (clientId: string): Promise<ClientWorkspaceTemplateAssignment[]> => {
      const assignments = await fetchApi(`/admin/project-workspaces/clients/${clientId}/assignments`);
      return (assignments || []).map(normalizeClientWorkspaceTemplateAssignment);
    },
    createClientAssignment: async (
      clientId: string,
      payload: {
        templateId: string;
        isDefault?: boolean;
        isActive?: boolean;
      },
    ): Promise<ClientWorkspaceTemplateAssignment> => {
      const assignment = await fetchApi(`/admin/project-workspaces/clients/${clientId}/assignments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return normalizeClientWorkspaceTemplateAssignment(assignment);
    },
    updateClientAssignment: async (
      assignmentId: string,
      payload: { isDefault?: boolean; isActive?: boolean },
    ): Promise<ClientWorkspaceTemplateAssignment> => {
      const assignment = await fetchApi(`/admin/project-workspaces/client-assignments/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return normalizeClientWorkspaceTemplateAssignment(assignment);
    },
    getDefaultDraft: async (clientId: string): Promise<ProjectWorkspaceConfigDraft | null> => {
      return fetchApi(`/project-workspaces/clients/${clientId}/default-draft`);
    },
  },

  reportBuilderProjects: {
    listAvailableTemplates: async (projectId: string): Promise<ClientReportTemplateAssignment[]> => {
      return fetchApi(`/projects/${projectId}/report-builder/templates`);
    },
    listAccessibleReports: async (): Promise<ProjectReport[]> => {
      return fetchApi('/project-reports');
    },
    listProjectReports: async (projectId: string): Promise<ProjectReport[]> => {
      return fetchApi(`/projects/${projectId}/project-reports`);
    },
    listClientVisibleReports: async (): Promise<ProjectReport[]> => {
      return fetchApi('/project-reports/client-visible');
    },
    createProjectReport: async (
      projectId: string,
      payload: {
        templateId: string;
        templateVersionId: string;
        title: string;
        description?: string;
        outputLocale?: 'en' | 'ar';
        visibility?: ProjectReportVisibility;
        performedById?: string;
      },
    ): Promise<ProjectReport> => {
      return fetchApi(`/projects/${projectId}/project-reports`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    getProjectReport: async (reportId: string): Promise<ProjectReport> => {
      return fetchApi(`/project-reports/${reportId}`);
    },
    updateProjectReport: async (
      reportId: string,
      payload: Partial<{
        title: string;
        description: string;
        outputLocale: 'en' | 'ar';
        status: ProjectReportStatus;
        visibility: ProjectReportVisibility;
        performedById: string;
        summaryJson: Record<string, unknown>;
        coverSnapshotJson: Record<string, unknown>;
      }>,
    ): Promise<ProjectReport> => {
      return fetchApi(`/project-reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    listEntries: async (reportId: string): Promise<ProjectReportEntry[]> => {
      const entries = await fetchApi(`/project-reports/${reportId}/entries`);
      return (entries || []).map(normalizeProjectReportEntry);
    },
    createEntry: async (
      reportId: string,
      payload: {
        sortOrder?: number;
        serviceName?: string;
        issueTitle: string;
        issueDescription: string;
        severity?: ProjectReportEntrySeverity;
        category?: string;
        subcategory?: string;
        pageUrl?: string;
        recommendation?: string;
        status?: ProjectReportEntryStatus;
        rowDataJson?: Record<string, unknown>;
      },
    ): Promise<ProjectReportEntry> => {
      const entry = await fetchApi(`/project-reports/${reportId}/entries`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return normalizeProjectReportEntry(entry);
    },
    updateEntry: async (
      reportId: string,
      entryId: string,
      payload: Partial<{
        sortOrder: number;
        serviceName: string;
        issueTitle: string;
        issueDescription: string;
        severity: ProjectReportEntrySeverity;
        category: string;
        subcategory: string;
        pageUrl: string;
        recommendation: string;
        status: ProjectReportEntryStatus;
        rowDataJson: Record<string, unknown>;
      }>,
    ): Promise<ProjectReportEntry> => {
      const entry = await fetchApi(`/project-reports/${reportId}/entries/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return normalizeProjectReportEntry(entry);
    },
    deleteEntry: async (reportId: string, entryId: string): Promise<void> => {
      await fetchApi(`/project-reports/${reportId}/entries/${entryId}`, {
        method: 'DELETE',
      });
    },
    uploadEntryMedia: async (
      reportId: string,
      entryId: string,
      file: File,
      caption?: string,
      onProgress?: (percent: number) => void,
    ) => {
      const formData = new FormData();
      formData.append('file', file);
      if (caption) formData.append('caption', caption);
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/project-reports/${reportId}/entries/${entryId}/media`);

        const token = localStorage.getItem('auth_token');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        if (onProgress) {
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
          };
        }

        xhr.onload = () => {
          let payload: any = null;
          if (xhr.responseText) {
            try {
              payload = JSON.parse(xhr.responseText);
            } catch {
              payload = null;
            }
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100);
            resolve(payload);
            return;
          }

          const message =
            (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
            payload?.error ||
            'Evidence upload failed';
          reject(new Error(message));
        };

        xhr.onerror = () => {
          reject(new Error('Evidence upload failed'));
        };

        xhr.send(formData);
      });
    },
    deleteEntryMedia: async (reportId: string, entryId: string, mediaId: string): Promise<void> => {
      await fetchApi(`/project-reports/${reportId}/entries/${entryId}/media/${mediaId}`, {
        method: 'DELETE',
      });
    },
    getPreviewHtml: async (reportId: string, locale: 'en' | 'ar' = 'en'): Promise<string> => {
      const res = await fetchApi(`/project-reports/${reportId}/preview?locale=${locale}`);
      return res.html || '';
    },
    getLatestExport: async (reportId: string): Promise<{ url: string; exportVersion: number }> => {
      return fetchApi(`/project-reports/${reportId}/latest-export`);
    },
    generateAiSummary: async (reportId: string): Promise<{ narratives: { introduction: string; statisticsSummary?: string; executiveSummary?: string; strengthsSummary?: string; complianceSummary?: string; recommendationsSummary: string } }> => {
      return fetchApi(`/project-reports/${reportId}/generate-ai-summary`, {
        method: 'POST',
      });
    },
    exportPdf: async (reportId: string, locale: 'en' | 'ar' = 'en'): Promise<{ downloadUrl?: string; export?: unknown }> => {
      return fetchApi(`/project-reports/${reportId}/export-pdf`, {
        method: 'POST',
        body: JSON.stringify({ locale }),
      });
    },
  },

  me: {
    getDashboardPreferences: async (): Promise<{ widgets: { id: string; order: number; config?: Record<string, unknown> }[] }> =>
      fetchApi('/users/me/dashboard-preferences', { silent: true }),
    updateDashboardPreferences: async (data: { widgets: { id: string; order: number; config?: Record<string, unknown> }[] }) =>
      fetchApi('/users/me/dashboard-preferences', { method: 'PATCH', body: JSON.stringify(data), silent: true }),
    changePassword: async (data: { currentPassword: string; newPassword: string }) =>
      fetchApi('/users/me/password', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  dashboard: {
    getAdminStats: async () => {
      try {
        const stats = await fetchApi('/dashboard/admin');
        return {
          ...stats,
          projectsAtRisk: (stats.projectsAtRisk || []).map(normalizeProject),
          latestUpdates: (stats.latestUpdates || []).map((u: any) => ({
             ...u,
            timestamp: u.timestamp || u.createdAt,
            authorName: u.authorName || u.author?.name || 'Unknown'
          })),
          clientComplianceComparison: (stats.clientComplianceComparison || []).map((item: any) => ({
            ...item,
            latestReportAt: item.latestReportAt || item.updatedAt,
          })),
        };
      } catch (e) {
        console.error('Failed to load admin dashboard:', e);
        // Fallback to empty stats
        return {
          totalClients: 0,
          activeProjects: 0,
          projectsAtRisk: [],
          overdueTasks: 0,
          recentUpdatesCount: 0,
          pendingMilestones: 0,
          pendingApprovals: 0,
          revenue: 0,
          revenueByMonth: [],
          latestUpdates: [],
          auditedClients: 0,
          averageCompliance: 0,
          needsAttentionChecks: 0,
          scoredChecks: 0,
          clientComplianceComparison: [],
        };
      }
    },
    getFinanceStats: async () => {
      try {
        return await fetchApi('/dashboard/finance');
      } catch (e) {
        console.error('Failed to load finance dashboard:', e);
        return {
          outstandingAmount: 0,
          invoicesDueCount: 0,
          paidThisMonth: 0,
          contractsActive: 0,
          overdueInvoices: [],
          recentInvoices: []
        };
      }
    },
    getDevStats: async () => {
      try {
        return await fetchApi('/dashboard/dev');
      } catch (e) {
        console.error('Failed to load dev dashboard:', e);
        return {
          myOpenTasks: 0,
          dueSoon: 0,
          inReview: 0,
          overdue: 0,
          assignedTasks: []
        };
      }
    },
    getClientStats: async () => {
      try {
        const stats = await fetchApi('/dashboard/client');
        return {
          ...stats,
          myProjects: (stats.myProjects || []).map(normalizeProject)
        };
      } catch (e) {
        console.error('Failed to load client dashboard:', e);
        return {
          activeProjects: 0,
          nextMilestonesCount: 0,
          latestUpdatesCount: 0,
          pendingApprovals: 0,
          sharedFilesCount: 0,
          files: [],
          myProjects: []
        };
      }
    }
  }
};

const fetchApiText = async (endpoint: string, options: RequestInit & { silent?: boolean } = {}) => {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeader(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = 'API Error';
    try {
      const error = text ? JSON.parse(text) : {};
      message = error.message || message;
      if (Array.isArray(message)) {
        message = message.join(', ');
      }
    } catch {
      message = text || message;
    }
    if (!options.silent) {
      toast.error(message);
    }
    throw new Error(message);
  }

  return res.text();
};
