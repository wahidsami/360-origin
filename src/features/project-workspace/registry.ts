export type ProjectTabGroupId = 'core' | 'planning' | 'resources';

export type ProjectTabId =
  | 'overview'
  | 'discussions'
  | 'tasks'
  | 'milestones'
  | 'updates'
  | 'timeline'
  | 'sprints'
  | 'findings'
  | 'reports'
  | 'time'
  | 'recurring'
  | 'files'
  | 'team'
  | 'financials'
  | 'testing'
  | 'activity';

export type WorkspaceTabState = 'hidden' | 'visible_read_only' | 'visible_interactive';
export type WorkspaceAudienceType = 'internal' | 'client' | 'mixed';
export type WorkspaceTabTier = 'primary' | 'secondary';

export type OverviewSectionId =
  | 'stage_banner'
  | 'readiness_checklist'
  | 'predictive_insights'
  | 'tasks_panel'
  | 'milestones_summary'
  | 'quality_panel'
  | 'team_capacity'
  | 'activity_feed'
  | 'financial_summary';

export interface ProjectTabGroupDefinition {
  id: ProjectTabGroupId;
  label: string;
  color: string;
}

export interface ProjectTabDefinition {
  id: ProjectTabId;
  label: string;
  group: ProjectTabGroupId;
  order: number;
  tier: WorkspaceTabTier;
  internalOnly?: boolean;
  canHide?: boolean;
  templateConfigurable?: boolean;
  supportsClientWorkspace?: boolean;
  audienceType?: WorkspaceAudienceType;
  defaultClientState?: WorkspaceTabState;
  dependsOn?: ProjectTabId[];
  recommendedWith?: ProjectTabId[];
  hidesOverviewSectionsWhenHidden?: OverviewSectionId[];
  notes?: string;
}

export interface OverviewSectionDefinition {
  id: OverviewSectionId;
  label: string;
  sourceTabs: ProjectTabId[];
  alwaysVisible?: boolean;
  notes?: string;
}

export interface ProjectWorkspaceTemplateDraft {
  name: string;
  audienceType: WorkspaceAudienceType;
  tabs: Array<{
    tabId: ProjectTabId;
    state: WorkspaceTabState;
    orderIndex: number;
  }>;
}

export interface ProjectWorkspaceConfigDraft {
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  assignedClientId?: string;
  audienceType: WorkspaceAudienceType;
  tabs: Array<{
    tabId: ProjectTabId;
    state: WorkspaceTabState;
    orderIndex: number;
  }>;
  overviewSections?: OverviewSectionId[];
}

export const PROJECT_TAB_GROUPS: ProjectTabGroupDefinition[] = [
  { id: 'core', label: 'Core', color: 'text-cyan-400' },
  { id: 'planning', label: 'Planning & Delivery', color: 'text-indigo-400' },
  { id: 'resources', label: 'Resources', color: 'text-slate-400' },
];

export const PROJECT_TAB_DEFINITIONS: ProjectTabDefinition[] = [
  {
    id: 'overview',
    label: 'Overview',
    group: 'core',
    order: 1,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    notes: 'Primary workspace landing tab. Usually kept visible, but still modeled as configurable for template completeness.',
  },
  {
    id: 'discussions',
    label: 'Discussions',
    group: 'core',
    order: 2,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_interactive',
    notes: 'Primary tab. Enabled by default so internal teams and clients can collaborate in one shared discussion surface from project start.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    group: 'core',
    order: 3,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    recommendedWith: ['milestones', 'team'],
    hidesOverviewSectionsWhenHidden: ['tasks_panel', 'milestones_summary'],
    notes: 'Primary dependency root for timeline, sprints, time, and recurring.',
  },
  {
    id: 'milestones',
    label: 'Milestones',
    group: 'core',
    order: 4,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    hidesOverviewSectionsWhenHidden: ['milestones_summary'],
    notes: 'Primary tab. Overview milestone summary should also hide when tasks is hidden.',
  },
  {
    id: 'updates',
    label: 'Updates',
    group: 'core',
    order: 5,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    notes: 'Primary tab. Safe to hide without affecting other capabilities.',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    group: 'planning',
    order: 1,
    tier: 'secondary',
    internalOnly: true,
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'hidden',
    dependsOn: ['tasks'],
    notes: 'Secondary tab. Cannot remain visible if Tasks is hidden.',
  },
  {
    id: 'sprints',
    label: 'Sprints',
    group: 'planning',
    order: 2,
    tier: 'secondary',
    internalOnly: true,
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'hidden',
    dependsOn: ['tasks'],
    notes: 'Secondary tab. Depends on Tasks.',
  },
  {
    id: 'findings',
    label: 'Findings',
    group: 'planning',
    order: 3,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    hidesOverviewSectionsWhenHidden: ['quality_panel'],
    notes: 'Primary tab. Hiding it must also hide quality-related overview surfaces.',
  },
  {
    id: 'reports',
    label: 'Reports',
    group: 'planning',
    order: 4,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    recommendedWith: ['findings', 'files'],
    notes: 'Primary tab for project-generated reports and assigned report templates.',
  },
  {
    id: 'time',
    label: 'Time',
    group: 'planning',
    order: 5,
    tier: 'secondary',
    internalOnly: true,
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'hidden',
    dependsOn: ['tasks'],
    notes: 'Secondary tab. Depends on Tasks.',
  },
  {
    id: 'recurring',
    label: 'Recurring',
    group: 'planning',
    order: 6,
    tier: 'secondary',
    internalOnly: true,
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'hidden',
    dependsOn: ['tasks'],
    notes: 'Secondary tab. Depends on Tasks.',
  },
  {
    id: 'files',
    label: 'Files',
    group: 'resources',
    order: 1,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    notes: 'Primary tab for shared project artifacts.',
  },
  {
    id: 'team',
    label: 'Team',
    group: 'resources',
    order: 2,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    hidesOverviewSectionsWhenHidden: ['team_capacity'],
    notes: 'Primary tab. Can be exposed to clients if product wants member transparency later.',
  },
  {
    id: 'financials',
    label: 'Financials',
    group: 'resources',
    order: 3,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    hidesOverviewSectionsWhenHidden: ['financial_summary'],
    notes: 'Primary tab. Hiding it must also remove financial summaries across the workspace.',
  },
  {
    id: 'testing',
    label: 'Testing Access',
    group: 'resources',
    order: 4,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    notes: 'Primary tab. Commonly hidden for client workspaces, but now modeled as configurable.',
  },
  {
    id: 'activity',
    label: 'Activity',
    group: 'resources',
    order: 5,
    tier: 'primary',
    canHide: true,
    templateConfigurable: true,
    supportsClientWorkspace: true,
    audienceType: 'mixed',
    defaultClientState: 'visible_read_only',
    hidesOverviewSectionsWhenHidden: ['activity_feed'],
    notes: 'Primary tab. Hiding it must also hide the overview activity feed.',
  },
];

export const PROJECT_TABS_BY_ID: Record<ProjectTabId, ProjectTabDefinition> = PROJECT_TAB_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.id] = definition;
    return acc;
  },
  {} as Record<ProjectTabId, ProjectTabDefinition>,
);

export const OVERVIEW_SECTION_REGISTRY: OverviewSectionDefinition[] = [
  { id: 'stage_banner', label: 'Stage Pipeline Banner', sourceTabs: ['overview'], alwaysVisible: true },
  { id: 'readiness_checklist', label: 'Readiness Checklist', sourceTabs: ['overview'], alwaysVisible: true },
  { id: 'predictive_insights', label: 'Predictive Insights', sourceTabs: ['overview'], alwaysVisible: true },
  { id: 'tasks_panel', label: 'Task Health', sourceTabs: ['tasks'] },
  { id: 'milestones_summary', label: 'Milestone Summary', sourceTabs: ['tasks', 'milestones'], notes: 'Hide when tasks is hidden, even if milestones stay enabled.' },
  { id: 'quality_panel', label: 'Quality / Findings', sourceTabs: ['findings'] },
  { id: 'team_capacity', label: 'Team Capacity', sourceTabs: ['team'], notes: 'Candidate for internal-only in client workspaces.' },
  { id: 'activity_feed', label: 'Recent Activity Feed', sourceTabs: ['activity'] },
  { id: 'financial_summary', label: 'Financial Summary Surfaces', sourceTabs: ['financials'] },
];

export const PROJECT_WORKSPACE_SCHEMA_DRAFT = {
  template: {
    name: 'ProjectWorkspaceTemplate',
    fields: ['id', 'orgId', 'name', 'description', 'audienceType', 'isDefault', 'status', 'createdBy', 'createdAt', 'updatedAt'],
  },
  templateTab: {
    name: 'ProjectWorkspaceTemplateTab',
    fields: ['id', 'templateId', 'tabId', 'state', 'orderIndex', 'overviewSectionsJson'],
  },
  clientAssignment: {
    name: 'ClientWorkspaceTemplateAssignment',
    fields: ['id', 'clientId', 'templateId', 'assignedAt', 'assignedBy'],
  },
  projectConfig: {
    name: 'ProjectWorkspaceConfig',
    fields: ['id', 'projectId', 'sourceTemplateId', 'sourceTemplateVersion', 'assignedClientId', 'createdAt', 'createdBy'],
  },
  projectConfigTab: {
    name: 'ProjectWorkspaceConfigTab',
    fields: ['id', 'projectWorkspaceConfigId', 'tabId', 'state', 'orderIndex', 'overviewSectionsJson'],
  },
} as const;

export interface WorkspaceDependencyWarning {
  tabId: ProjectTabId;
  missingDependencies: ProjectTabId[];
}

export const TEMPLATE_CONFIGURABLE_TAB_DEFINITIONS = PROJECT_TAB_DEFINITIONS.filter(
  (definition) => definition.templateConfigurable,
);

export const PRIMARY_TEMPLATE_TAB_DEFINITIONS = TEMPLATE_CONFIGURABLE_TAB_DEFINITIONS.filter(
  (definition) => definition.tier === 'primary',
);

export const SECONDARY_TEMPLATE_TAB_DEFINITIONS = TEMPLATE_CONFIGURABLE_TAB_DEFINITIONS.filter(
  (definition) => definition.tier === 'secondary',
);

export function validateWorkspaceDependencies(enabledTabs: ProjectTabId[]): WorkspaceDependencyWarning[] {
  const enabled = new Set(enabledTabs);

  return TEMPLATE_CONFIGURABLE_TAB_DEFINITIONS.flatMap((definition) => {
    if (!enabled.has(definition.id) || !definition.dependsOn?.length) {
      return [];
    }

    const missingDependencies = definition.dependsOn.filter((dependency) => !enabled.has(dependency));
    if (missingDependencies.length === 0) {
      return [];
    }

    return [{ tabId: definition.id, missingDependencies }];
  });
}

export function collectHiddenOverviewSections(hiddenTabs: ProjectTabId[]): OverviewSectionId[] {
  const hidden = new Set(hiddenTabs);
  const coupledSections = new Set<OverviewSectionId>();

  for (const definition of PROJECT_TAB_DEFINITIONS) {
    if (!hidden.has(definition.id)) continue;
    for (const sectionId of definition.hidesOverviewSectionsWhenHidden || []) {
      coupledSections.add(sectionId);
    }
  }

  return Array.from(coupledSections);
}

export function resolveDependentTabs(hiddenPrimaryTabs: ProjectTabId[]): ProjectTabId[] {
  const hidden = new Set(hiddenPrimaryTabs);
  const autoHiddenDependents = new Set<ProjectTabId>();

  for (const definition of SECONDARY_TEMPLATE_TAB_DEFINITIONS) {
    if (!definition.dependsOn?.length) continue;
    if (definition.dependsOn.some((dependency) => hidden.has(dependency))) {
      autoHiddenDependents.add(definition.id);
    }
  }

  return Array.from(autoHiddenDependents);
}

export function buildDefaultProjectWorkspaceConfigDraft(assignedClientId?: string): ProjectWorkspaceConfigDraft {
  const defaultClientTabStates: Partial<Record<ProjectTabId, WorkspaceTabState>> = {
    overview: 'visible_read_only',
    discussions: 'visible_interactive',
    tasks: 'visible_read_only',
    milestones: 'visible_read_only',
    updates: 'visible_read_only',
    findings: 'visible_read_only',
    reports: 'visible_read_only',
    files: 'visible_read_only',
    team: 'visible_read_only',
    financials: 'visible_read_only',
    testing: 'visible_read_only',
    activity: 'visible_read_only',
  };

  return {
    assignedClientId,
    audienceType: 'client',
    tabs: TEMPLATE_CONFIGURABLE_TAB_DEFINITIONS.map((definition, index) => ({
      tabId: definition.id,
      state: defaultClientTabStates[definition.id] || 'hidden',
      orderIndex: index + 1,
    })),
    overviewSections: [],
  };
}
