import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Edit, Sparkles } from 'lucide-react';
import { Project, Client, Milestone, ProjectUpdate, EnvironmentAccess, Discussion, DiscussionReply, Permission, ActivityLog, FileAsset, ProjectMember, Role, Finding, Report, Task, isInternalRole, ProjectReadiness, ReadinessAction } from '../types';
import { api } from '../services/api';
import { Button, Badge, KpiCard } from '../components/ui/UIComponents';
import { PermissionGate } from '../components/PermissionGate';
import { MilestonesTab, UpdatesTab, EnvironmentsTab, DiscussionsTab, OverviewTab, FilesTab, TeamTab, FindingsTab, ReportsTab, TimeTab, TimelineTab, SprintsTab, ActivityTab, FinancialsTab } from '../components/project/ProjectTabs';
import { TasksTab } from '../components/project/TasksTab';
import { RecurringTasksTab } from '../components/project/RecurringTasksTab';
import { useAuth } from '../contexts/AuthContext';
import { useAI } from '../contexts/AIContext';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import { PermissionsService } from '../services/permissions.service';
import toast from 'react-hot-toast';
import { buildDefaultProjectWorkspaceConfigDraft, PROJECT_TAB_DEFINITIONS, PROJECT_TAB_GROUPS, ProjectTabId } from '@/features/project-workspace/registry';
import { resolveProjectWorkspace } from '@/features/project-workspace/resolver';
import { navigateBack } from '@/utils/navigation';

export const ProjectDetails: React.FC = () => {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, can } = useAuth();
  const { openAI, setContext } = useAI();
  const [activeTab, setActiveTab] = useState('overview');
  const [isPending, startTransition] = React.useTransition();
  const latestLoadRef = useRef(0);

  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentAccess[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [financialsData, setFinancialsData] = useState<{ contract?: any; invoices: any[] }>({ contract: undefined, invoices: [] });
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [isOverviewMetaLoading, setIsOverviewMetaLoading] = useState(false);
  const [hasLoadedOverviewMeta, setHasLoadedOverviewMeta] = useState(false);
  const [isOverviewMetaStale, setIsOverviewMetaStale] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const handleGoBack = () => navigateBack(navigate, '/app/projects');

  const resolvedWorkspace = React.useMemo(() => {
    if (!user) {
      return resolveProjectWorkspace({ visibleTabIds: [] });
    }

    const isInternalUser = isInternalRole(user.role);
    const roleVisibleTabIds = PermissionsService.getVisibleTabs(user.role)
      .filter((tabId): tabId is ProjectTabId => PROJECT_TAB_DEFINITIONS.some((definition) => definition.id === tabId));

    const workspaceTabs = Array.isArray(project?.workspaceConfig?.tabsJson)
      ? project.workspaceConfig.tabsJson.map((tab) => ({
          tabId: tab.tabId as ProjectTabId,
          state: tab.state,
          orderIndex: tab.orderIndex,
        }))
      : [];

    const normalizedWorkspaceTabs = (() => {
      const restoredClientTabs = new Set<ProjectTabId>(['discussions', 'updates', 'findings', 'team', 'financials', 'testing', 'activity']);
      const nextTabs = [...workspaceTabs];

      const ensureTabState = (tabId: ProjectTabId, state: 'visible_read_only' | 'visible_interactive') => {
        if (!roleVisibleTabIds.includes(tabId)) return;

        const orderIndex = PROJECT_TAB_DEFINITIONS.find((definition) => definition.id === tabId)?.order ?? nextTabs.length + 1;
        const existingIndex = nextTabs.findIndex((tab) => tab.tabId === tabId);

        if (existingIndex === -1) {
          nextTabs.push({ tabId, state, orderIndex });
          return;
        }

        if (nextTabs[existingIndex].state === 'hidden') {
          nextTabs[existingIndex] = {
            ...nextTabs[existingIndex],
            state,
          };
        }
      };

      if (user.role !== Role.FINANCE) {
        ensureTabState('discussions', 'visible_interactive');
      }

      if (!isInternalUser) {
        restoredClientTabs.forEach((tabId) => {
          if (tabId === 'discussions') {
            ensureTabState(tabId, 'visible_interactive');
          } else {
            ensureTabState(tabId, 'visible_read_only');
          }
        });
      }

      return nextTabs;
    })();

    const interactiveWorkspaceTabs = new Set(
      normalizedWorkspaceTabs
        .filter((tab) => tab.state === 'visible_interactive')
        .map((tab) => tab.tabId),
    );

    const fallbackClientWorkspaceConfig = !isInternalUser && !project?.workspaceConfig
      ? {
          tabs: buildDefaultProjectWorkspaceConfigDraft(project?.clientId).tabs,
        }
      : null;

    const shouldApplyWorkspaceTemplateToRole = Boolean(
      project?.workspaceConfig &&
      (
        project.workspaceConfig.audienceType === 'mixed' ||
        project.workspaceConfig.audienceType === 'internal' ||
        !isInternalUser
      )
    );

    const roleReadOnlyTabIds = PROJECT_TAB_DEFINITIONS
      .filter((definition) => PermissionsService.isTabReadOnly(user.role, definition.id))
      .filter((definition) => !shouldApplyWorkspaceTemplateToRole || !interactiveWorkspaceTabs.has(definition.id))
      .map((definition) => definition.id);

    return resolveProjectWorkspace({
      visibleTabIds: roleVisibleTabIds,
      readOnlyTabIds: roleReadOnlyTabIds,
      workspaceConfig:
        shouldApplyWorkspaceTemplateToRole && project?.workspaceConfig
          ? {
              tabs: normalizedWorkspaceTabs,
            }
          : fallbackClientWorkspaceConfig,
    });
  }, [project?.clientId, project?.workspaceConfig, user?.role]);

  const tabStateMap = resolvedWorkspace.tabStates;
  const canInteractWithTab = React.useCallback((tabId: ProjectTabId) => tabStateMap[tabId] === 'visible_interactive', [tabStateMap]);
  const hiddenOverviewSections = React.useMemo(() => {
    const sections = [...resolvedWorkspace.hiddenOverviewSections];
    if (user && isInternalRole(user.role) === false && !sections.includes('readiness_checklist')) {
      sections.push('readiness_checklist');
    }
    return sections;
  }, [resolvedWorkspace.hiddenOverviewSections, user]);

  // --- Role-Based Tab Selection ---
  const visibleTabs = resolvedWorkspace.visibleTabs;
  const projectStatusLabel = project
    ? t(`status_${project.status}`, { defaultValue: t(project.status, { defaultValue: project.status.replace(/_/g, ' ') }) })
    : '';
  const requestedTab = searchParams.get('tab');

  const handleTabChange = React.useCallback((tabId: string) => {
    setActiveTab(tabId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tabId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // --- Safe Role-Based Default Tab Selection ---
  useEffect(() => {
    if (!project || !user) return;

    // 1. Only auto-switch if we are on 'overview' (the default state)
    // and haven't explicitly navigated elsewhere.
    if (activeTab !== 'overview') return;

    const targetTab = PermissionsService.getDefaultLanding(user.role);

    // 2. Critical: Check if the user actually has visibility for this tab
    if (targetTab !== 'overview' && visibleTabs.some(t => t.id === targetTab)) {
      handleTabChange(targetTab);
    }
  }, [handleTabChange, project?.id, user?.role, visibleTabs]); // Only re-run if project or role changes

  useEffect(() => {
    if (!requestedTab || visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === requestedTab)) return;
    if (requestedTab === activeTab) return;
    setActiveTab(requestedTab);
  }, [activeTab, requestedTab, visibleTabs]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (visibleTabs.some((tab) => tab.id === activeTab)) return;
    handleTabChange(visibleTabs[0]?.id || 'overview');
  }, [activeTab, handleTabChange, visibleTabs]);

  useEffect(() => {
    if (projectId) {
      const requestId = latestLoadRef.current + 1;
      latestLoadRef.current = requestId;

      setContext({ projectId });
      setIsLoadingProject(true);
      setProject(null);
      setClient(null);
      setMilestones([]);
      setUpdates([]);
      setEnvironments([]);
      setDiscussions([]);
      setActivity([]);
      setFiles([]);
      setMembers([]);
      setFindings([]);
      setReports([]);
      setTasks([]);
      setFinancialsData({ contract: undefined, invoices: [] });
      setReadiness(null);
      setMetrics(null);
      setHasLoadedOverviewMeta(false);
      setIsOverviewMetaStale(false);
      loadData(projectId, requestId);
    }
    return () => setContext({});
  }, [projectId, setContext]);

  const loadOverviewMeta = useCallback(async () => {
    if (!projectId) return;

    setIsOverviewMetaLoading(true);
    try {
      const [rd, met] = await Promise.all([
        api.projects.getReadiness(projectId).catch(e => { console.error('Readiness failed', e); return null; }),
        api.projects.getMetrics(projectId).catch(e => { console.error('Metrics failed', e); return null; })
      ]);

      startTransition(() => {
        setReadiness(rd as any);
        setMetrics(met);
        setHasLoadedOverviewMeta(true);
        setIsOverviewMetaStale(false);
      });
    } finally {
      setIsOverviewMetaLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || activeTab !== 'overview') return;
    if (hasLoadedOverviewMeta && !isOverviewMetaStale) return;
    loadOverviewMeta();
  }, [projectId, activeTab, hasLoadedOverviewMeta, isOverviewMetaStale, loadOverviewMeta]);

  // --- Real-time milestone refresh ---
  // Refreshes milestones in the background without disturbing the rest of the page.
  const refreshMilestones = useCallback(async () => {
    if (!projectId) return;
    try {
      const m = await api.projects.getMilestones(projectId);
      setMilestones(m);
    } catch (e) {
      // Silent fail — no toast, user is not interrupted
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    // Poll every 30 seconds
    const poll = setInterval(refreshMilestones, 30_000);
    // Also listen for an instant refresh event fired by other components
    const onMilestoneChange = () => refreshMilestones();
    window.addEventListener('project:milestone_changed', onMilestoneChange);
    return () => {
      clearInterval(poll);
      window.removeEventListener('project:milestone_changed', onMilestoneChange);
    };
  }, [projectId, refreshMilestones]);

  const refreshReadiness = async () => {
    if (!projectId) return;
    // Small delay to ensure backend state is committed and processed
    setTimeout(async () => {
      try {
        if (activeTab === 'overview') {
          await loadOverviewMeta();
          console.log("Readiness and metrics refreshed");
        } else {
          setIsOverviewMetaStale(true);
          console.log("Readiness and metrics marked stale for next overview visit");
        }
      } catch (e) {
        console.error('Readiness refresh failed', e);
      }
    }, 300);
  };

  const refreshFinancials = useCallback(async () => {
    if (!projectId) return;
    try {
      const financials = await api.projects.getFinancials(projectId);
      setFinancialsData(financials as { contract?: any; invoices: any[] });
    } catch (error) {
      console.error('Financials failed', error);
    }
  }, [projectId]);

  const refreshEnvironments = useCallback(async () => {
    if (!projectId) return;
    try {
      const envs = await api.projects.getEnvironments(projectId);
      setEnvironments(envs);
    } catch (e) {
      // Silent fail — no toast, user is not interrupted
    }
  }, [projectId]);

  const loadData = useCallback(async (requestedProjectId: string | undefined = projectId, requestId: number = latestLoadRef.current) => {
    if (!requestedProjectId) {
      setIsLoadingProject(false);
      return;
    }

    try {
      const p = await api.projects.get(requestedProjectId);
      if (requestId !== latestLoadRef.current) return;

      if (!p) {
        setIsLoadingProject(false);
        return;
      }

      startTransition(() => {
        setProject(p);
      });

      const c = await api.clients.get(p.clientId).catch((error) => {
        console.error('Client failed', error);
        return null;
      });
      if (requestId !== latestLoadRef.current) return;

      startTransition(() => {
        setClient(c || null);
      });

      const [m, u, e, th, act, fl, mem, fnd, rep, tsk, fin] = await Promise.all([
        api.projects.getMilestones(requestedProjectId).catch(e => { console.error('Milestones failed', e); return []; }),
        api.projects.getUpdates(requestedProjectId).catch(e => { console.error('Updates failed', e); return []; }),
        api.projects.getEnvironments(requestedProjectId).catch(e => { console.error('Environments failed', e); return []; }),
        api.projects.getDiscussions(requestedProjectId).catch(e => { console.error('Discussions failed', e); return []; }),
        api.projects.getActivity(requestedProjectId).catch(e => { console.error('Activity failed', e); return []; }),
        api.projects.getFiles(requestedProjectId).catch(e => { console.error('Files failed', e); return []; }),
        api.projects.getMembers(requestedProjectId).catch(e => { console.error('Members failed', e); return []; }),
        api.projects.getFindings(requestedProjectId).catch(e => { console.error('Findings failed', e); return []; }),
        api.projects.getReports(requestedProjectId).catch(e => { console.error('Reports failed', e); return []; }),
        api.projects.getTasks(requestedProjectId).catch(e => { console.error('Tasks failed', e); return []; }),
        api.projects.getFinancials(requestedProjectId).catch(e => { console.error('Financials failed', e); return { contract: undefined, invoices: [] }; })
      ]);
      if (requestId !== latestLoadRef.current) return;

      startTransition(() => {
        setMilestones(m);
        setUpdates(u);
        setEnvironments(e);
        setDiscussions(th as any);
        setActivity(act);
        setFiles(fl);
        setMembers(mem);
        setFindings(fnd);
        setReports(rep);
        setTasks(tsk);
        setFinancialsData(fin as { contract?: any; invoices: any[] });
      });
    } catch (error) {
      if (requestId !== latestLoadRef.current) return;
      console.error("Critical error loading project data", error);
    } finally {
      if (requestId === latestLoadRef.current) {
        setIsLoadingProject(false);
      }
    }
  }, [projectId]);

  const handlePostUpdate = async (update: Partial<ProjectUpdate>) => {
    if (!project) return;
    await api.projects.createUpdate(project.id, {
      title: update.title!,
      content: update.content!,
      visibility: update.visibility || 'internal'
    });
    const u = await api.projects.getUpdates(project.id);
    setUpdates(u);
  };

  const handleUpsertMilestone = async (m: Partial<Milestone>) => {
    if (!project || !projectId) return;
    await api.projects.upsertMilestone({
      ...m,
      projectId,
      title: m.title!,
      dueDate: m.dueDate!,
      status: m.status || 'PENDING',
      percentComplete: m.percentComplete || 0
    } as Milestone);
    const ms = await api.projects.getMilestones(projectId);
    setMilestones(ms);
    refreshReadiness();
  };

  const handleDeleteMilestone = async (id: string) => {
    if (!projectId) return;
    await api.projects.deleteMilestone(projectId, id);
    const ms = await api.projects.getMilestones(projectId);
    setMilestones(ms);
    refreshReadiness();
  };

  const handleUpsertEnvironment = async (environment: { id?: string; name: string; url: string; username?: string | null }) => {
    if (!projectId) return;
    if (environment.id) {
      await api.projects.updateEnvironment(projectId, environment.id, {
        name: environment.name,
        url: environment.url,
        username: environment.username,
      });
    } else {
      await api.projects.createEnvironment(projectId, {
        name: environment.name,
        url: environment.url,
        username: environment.username,
      });
    }
    await refreshEnvironments();
    refreshReadiness();
  };

  const handleDeleteEnvironment = async (environmentId: string) => {
    if (!projectId) return;
    await api.projects.deleteEnvironment(projectId, environmentId);
    await refreshEnvironments();
    refreshReadiness();
  };

  const handleUploadFile = async (file: File, metadata: { name: string; category: string; visibility: string }) => {
    if (!project || !projectId) return;

    try {
      await api.projects.uploadFile(
        projectId,
        file,
        metadata.category,
        metadata.visibility,
        metadata.name || undefined  // Pass display name to backend
      );

      const fl = await api.projects.getFiles(projectId);
      setFiles(fl);
      refreshReadiness();
    } catch (error) {
      console.error("Failed to upload file:", error);
      toast.error("Failed to upload file. Please try again.");
    }
  };

  const handleDownloadFile = async (fileId: string, download: boolean = true): Promise<string | undefined> => {
    if (!projectId) return undefined;
    return api.projects.downloadFile(projectId, fileId, download);
  };

  const handleDeleteFile = async (fileId: string): Promise<void> => {
    if (!projectId) return;
    const success = await api.projects.deleteFile(projectId, fileId);
    if (success) {
      const fl = await api.projects.getFiles(projectId);
      setFiles(fl);
      refreshReadiness();
    } else {
      toast.error('Failed to delete file. Please try again.');
    }
  };

  // === Discussion Handlers ===
  const handleCreateDiscussion = async (title: string, body: string, clientRequestId?: string) => {
    if (!projectId) return;
    return api.projects.createDiscussion(projectId, title, body, clientRequestId);
  };

  const handleDeleteDiscussion = async (discussionId: string) => {
    if (!projectId) return;
    await api.projects.deleteDiscussion(projectId, discussionId);
  };

  const handleGetReplies = async (discussionId: string): Promise<DiscussionReply[]> => {
    if (!projectId) return [];
    return api.projects.getReplies(projectId, discussionId);
  };

  const handleCreateReply = async (discussionId: string, body: string, clientRequestId?: string) => {
    if (!projectId) return;
    return api.projects.createReply(projectId, discussionId, body, clientRequestId);
  };

  const handleDeleteReply = async (discussionId: string, replyId: string) => {
    if (!projectId) return;
    await api.projects.deleteReply(projectId, discussionId, replyId);
  };

  const handleUpdateRole = async (userId: string, role: Role) => {
    if (!projectId) return;
    await api.projects.updateMemberRole(projectId, userId, role);
    const mem = await api.projects.getMembers(projectId);
    setMembers(mem);
    refreshReadiness();
  };

  const handleAddMember = async (userId: string, role: Role) => {
    if (!projectId) return;
    await api.projects.addMember(projectId, userId, role);
    const mem = await api.projects.getMembers(projectId);
    setMembers(mem);
    refreshReadiness();
  };

  const handleRemoveMember = async (userId: string) => {
    if (!projectId) return;
    await api.projects.removeMember(projectId, userId);
    const mem = await api.projects.getMembers(projectId);
    setMembers(mem);
    refreshReadiness();
  };

  // --- Finding Handlers ---
  const handleRefreshFindings = async () => {
    if (!projectId) return;
    const fnd = await api.projects.getFindings(projectId);
    setFindings(fnd);
  };

  // --- Task Handlers ---
  const handleUpsertTask = async (t: Partial<Task>) => {
    if (!projectId) return;
    if (t.id) {
      // Stripping relational objects and server-only / system fields
      const {
        id,
        projectId: _pid,
        sourceRecurringId,
        createdAt,
        updatedAt,
        deletedAt,
        // Strip relational objects
        milestone,
        sprint,
        assignee,
        assignedTo,
        dependencies,
        _count,
        // Preserve denormalized fields if necessary, but backend usually expects IDs
        assigneeName,
        // Send the rest
        ...rest
      } = t as any;

      const payload = {
        ...rest,
        // Ensure dates are correctly formatted
        startDate: rest.startDate ? new Date(rest.startDate).toISOString().slice(0, 10) : undefined,
        dueDate: rest.dueDate ? new Date(rest.dueDate).toISOString().slice(0, 10) : undefined,
      };

      await api.projects.updateTask(projectId, t.id, payload);
    } else {
      await api.projects.createTask(projectId, t);
    }
    const [newTasks, newMilestones] = await Promise.all([
      api.projects.getTasks(projectId),
      api.projects.getMilestones(projectId),
    ]);
    setTasks(newTasks);
    setMilestones(newMilestones);
    refreshReadiness();
  };

  const handleDeleteTask = async (id: string) => {
    if (!projectId) return;
    await api.projects.deleteTask(projectId, id);
    const [newTasks, newMilestones] = await Promise.all([
      api.projects.getTasks(projectId),
      api.projects.getMilestones(projectId),
    ]);
    setTasks(newTasks);
    setMilestones(newMilestones);
    refreshReadiness();
  };

  const handleMoveTask = async (id: string, status: any) => {
    if (!projectId) return;
    await api.projects.moveTaskStatus(projectId, id, status);
    const [newTasks, newMilestones] = await Promise.all([
      api.projects.getTasks(projectId),
      api.projects.getMilestones(projectId),
    ]);
    setTasks(newTasks);
    setMilestones(newMilestones);
    refreshReadiness();
  };

  const handleReadinessAction = (action: ReadinessAction) => {
    const currentProjectId = projectId || project?.id;
    console.log("Guided Action Triggered:", action, "Project ID:", currentProjectId);

    if (action.type === 'navigate_tab' && action.target) {
      if (visibleTabs.some(t => t.id === action.target)) {
        console.log("Navigating to tab:", action.target);
        handleTabChange(action.target);
      } else {
        console.warn("Target tab not visible or restricted:", action.target);
      }
    } else if (action.type === 'open_edit_project') {
      const editPath = `/app/projects/${currentProjectId}/edit`;
      const hasPerm = can(Permission.MANAGE_PROJECTS);
      console.log("Action: Open Edit Project", { path: editPath, hasPermission: hasPerm, userRole: user?.role });

      if (hasPerm) {
        navigate(editPath);
      } else {
        console.error("Permission Denied for Edit Project Action");
        toast.error("You do not have permission to edit this mission's parameters. Please contact an administrator.");
      }
    }
  };

  if (isLoadingProject) return <div className="p-10 text-center text-slate-500">{t('loading_mission_data')}</div>;
  if (!project) return <div className="p-10 text-center text-slate-500">Project not found.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex gap-4">
          <Button variant="ghost" onClick={handleGoBack}><ArrowLeft className="w-5 h-5" /></Button>
          <div>

            <h1 className="text-3xl font-bold font-display text-white">{project.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-slate-400 cursor-pointer hover:text-cyan-400 transition-colors" onClick={() => navigate(`/app/clients/${client?.id}`)}>
                {client?.name || t('unknown_client')}
              </p>
              <span className="text-slate-600">•</span>
              <p className="text-slate-500 text-sm">
                {project.startDate ? new Date(project.startDate).toLocaleDateString() : '...'} — {project.deadline || (project as any).endDate ? new Date(project.deadline || (project as any).endDate).toLocaleDateString() : '...'}
              </p>
              {project.tags && project.tags.map((tag: string) => (
                <Badge key={tag} variant="neutral">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" size="sm" onClick={() => openAI({ projectId: project.id })} title="AI Assistant">
            <Sparkles className="w-4 h-4 mr-1" /> AI
          </Button>
          <Badge variant={project.status === 'in_progress' ? 'info' : project.status === 'deployed' ? 'success' : 'neutral'}>
            {projectStatusLabel.toUpperCase()}
          </Badge>
          <PermissionGate permission={Permission.MANAGE_PROJECTS}>
            {![Role.CLIENT_OWNER, Role.CLIENT_MANAGER, Role.CLIENT_MEMBER].includes(user?.role as Role) && (
              <Button variant="secondary" size="sm" onClick={() => navigate(`/app/projects/${project.id}/edit`)}>
                <Edit className="w-4 h-4 mr-2" /> {t('edit')}
              </Button>
            )}
          </PermissionGate>
        </div>
      </div>

      {/* Tabs Nav (Grouped) */}
      <div className="flex flex-col gap-4 border-b border-slate-700/50 pb-1">
        <div className="flex items-center overflow-x-auto scrollbar-none gap-2">
          {PROJECT_TAB_GROUPS.map((group, idx) => {
            const groupTabs = visibleTabs.filter(t => t.group === group.id);
            if (groupTabs.length === 0) return null;

            return (
              <React.Fragment key={group.id}>
                {idx > 0 && <div className="h-6 w-px bg-slate-700/50 mx-2 self-center shrink-0" />}
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] uppercase tracking-widest font-bold ${group.color} opacity-40 px-2 select-none whitespace-nowrap hidden lg:inline`}>
                    {t(`tab_group_${group.id}`)}
                  </span>
                  <div className="flex gap-0.5">
                    {groupTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => startTransition(() => handleTabChange(tab.id))}
                        className={`py-1.5 px-2.5 rounded-lg font-medium text-xs transition-all whitespace-nowrap ${activeTab === tab.id
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                          } ${isPending ? 'opacity-50' : ''}`}
                      >
                        {t(`tab_${tab.id}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        <ErrorBoundary fallback={<div className="p-10 text-center text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-xl">Something went wrong in this tab. Please try refreshing.</div>}>
          <React.Suspense fallback={<div className="p-10 text-center text-slate-500 animate-pulse flex flex-col items-center gap-2 font-display">
            <Sparkles className="w-8 h-8 text-cyan-500 animate-spin" />
            Loading {activeTab}...
          </div>}>
            {activeTab === 'overview' && (
              <div className="relative">
                <OverviewTab
                  project={project}
                  stats={{
                    taskCount: tasks.length,
                    completedTasks: tasks.filter(t => t.status?.toLowerCase() === 'done').length,
                    overdueTasks: tasks.filter(t => t.status?.toLowerCase() !== 'done' && t.dueDate && new Date(t.dueDate) < new Date()).length,
                    milestoneCount: milestones.length,
                    completedMilestones: milestones.filter(m => m.status?.toLowerCase() === 'completed').length,
                    atRiskMilestones: milestones.filter(m => m.status?.toLowerCase() !== 'completed' && m.dueDate && new Date(m.dueDate) < new Date()).length,
                    findingCount: findings.length,
                    unresolvedFindings: findings.filter(f => !['closed', 'dismissed'].includes(f.status.toLowerCase())).length
                  }}
                  tasks={tasks}
                  findings={findings}
                  milestones={milestones}
                  onNavigate={(tab) => {
                    if (visibleTabs.some(t => t.id === tab)) {
                      handleTabChange(tab);
                    } else {
                      toast.error('You do not have permission to view this tab.');
                    }
                  }}
                  onAction={handleReadinessAction}
                  onRefresh={loadData}
                  allowedTabs={visibleTabs.map(t => t.id)}
                  readiness={readiness}
                  metrics={metrics}
                  activity={activity}
                  hiddenOverviewSections={hiddenOverviewSections}
                />
                {isOverviewMetaLoading && (
                  <div className="pointer-events-none absolute right-6 top-10 z-10 w-[320px] max-w-[calc(100%-3rem)]">
                    <div className="rounded-2xl border border-cyan-200/70 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-cyan-500/20 dark:bg-slate-900/90">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 animate-spin text-cyan-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">Loading workflow readiness...</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Overview insights are loading in the background.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'tasks' && <TasksTab
              projectId={projectId!}
              tasks={tasks}
              milestones={milestones}
              members={members}
              onUpsert={handleUpsertTask}
              onDelete={handleDeleteTask}
              onMove={handleMoveTask}
              onJoin={() => handleAddMember(user?.id || '', user?.role as any)}
              currentUserId={user?.id || ''}
              defaultFilter={(user?.role === Role.QA || user?.role === Role.DEV) ? 'my-tasks' : 'all'}
              canManageTasks={can(Permission.MANAGE_TASKS)}
              canJoinTeam={!!user && isInternalRole(user.role)}
            />}
            {activeTab === 'time' && projectId && <TimeTab projectId={projectId} tasks={tasks} currentUserId={user?.id} />}
            {activeTab === 'timeline' && projectId && <TimelineTab projectId={projectId} tasks={tasks} onRefreshTasks={async () => { if (projectId) { const tsk = await api.projects.getTasks(projectId); setTasks(tsk); refreshReadiness(); } }} />}
            {activeTab === 'sprints' && projectId && <SprintsTab projectId={projectId} tasks={tasks} onRefreshTasks={async () => { if (projectId) { const tsk = await api.projects.getTasks(projectId); setTasks(tsk); refreshReadiness(); } }} onUpsertTask={handleUpsertTask} />}
            {activeTab === 'recurring' && projectId && <RecurringTasksTab projectId={projectId} onRefreshTasks={async () => { if (projectId) { const tsk = await api.projects.getTasks(projectId); setTasks(tsk); refreshReadiness(); } }} />}
            {activeTab === 'milestones' && <MilestonesTab milestones={milestones} onUpsert={handleUpsertMilestone} onDelete={handleDeleteMilestone} />}
            {activeTab === 'updates' && <UpdatesTab updates={updates} onPost={handlePostUpdate} canPost={canInteractWithTab('updates')} />}
            {activeTab === 'files' && (
              <FilesTab
                files={files}
                onUpload={handleUploadFile}
                onDownload={handleDownloadFile}
                onDelete={handleDeleteFile}
                canUpload={canInteractWithTab('files')}
                canDelete={can(Permission.MANAGE_TASKS)}
              />
            )}
            {activeTab === 'team' && <TeamTab members={members} onUpdateRole={handleUpdateRole} onAdd={handleAddMember} onRemove={handleRemoveMember} />}
            {activeTab === 'findings' && <FindingsTab findings={findings} projectId={projectId!} onRefresh={handleRefreshFindings} />}
            {activeTab === 'reports' && <ReportsTab reports={reports} projectName={project?.name} onRefresh={loadData} />}
            {activeTab === 'financials' && <FinancialsTab contract={financialsData.contract} invoices={financialsData.invoices} onRefresh={refreshFinancials} />}
            {activeTab === 'testing' && <EnvironmentsTab environments={environments} canManage={can(Permission.MANAGE_PROJECTS)} onUpsert={handleUpsertEnvironment} onDelete={handleDeleteEnvironment} />}
            {activeTab === 'discussions' && <DiscussionsTab
              projectId={projectId!}
              discussions={discussions}
              onCreateThread={handleCreateDiscussion}
              onDeleteThread={handleDeleteDiscussion}
              onGetReplies={handleGetReplies}
              onCreateReply={handleCreateReply}
              onDeleteReply={handleDeleteReply}
              canCreate={canInteractWithTab('discussions')}
            />}
            {activeTab === 'activity' && <ActivityTab activity={activity} onRefresh={loadData} />}
          </React.Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};
