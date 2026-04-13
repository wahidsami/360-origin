import React from 'react';
import { Link2, Plus, Save, Layers3, Users, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Badge, Button, GlassCard, Input, Label, Modal, Select, TextArea } from '@/components/ui/UIComponents';
import {
  buildDefaultProjectWorkspaceConfigDraft,
  PROJECT_TAB_DEFINITIONS,
  PRIMARY_TEMPLATE_TAB_DEFINITIONS,
  PROJECT_TAB_GROUPS,
  PROJECT_TABS_BY_ID,
  SECONDARY_TEMPLATE_TAB_DEFINITIONS,
  validateWorkspaceDependencies,
} from '@/features/project-workspace/registry';
import { summarizeWorkspaceDraft } from '@/features/project-workspace/helpers';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import {
  Client,
  ClientWorkspaceTemplateAssignment,
  ProjectWorkspaceConfigTab,
  ProjectWorkspaceTemplate,
  Role,
  WorkspaceAudienceType,
  WorkspaceTemplateStatus,
} from '@/types';

const AUDIENCE_OPTIONS: WorkspaceAudienceType[] = ['client', 'internal', 'mixed'];
const STATUS_OPTIONS: WorkspaceTemplateStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
const TAB_STATE_OPTIONS = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'visible_read_only', label: 'Read only' },
  { value: 'visible_interactive', label: 'Interactive' },
] as const;

const VISIBLE_PRIMARY_TEMPLATE_TAB_DEFINITIONS = PRIMARY_TEMPLATE_TAB_DEFINITIONS;
const VISIBLE_SECONDARY_TEMPLATE_TAB_DEFINITIONS = SECONDARY_TEMPLATE_TAB_DEFINITIONS;

const buildDefaultTemplateDefinition = () => {
  const draft = buildDefaultProjectWorkspaceConfigDraft();
  return {
    tabs: draft.tabs,
    overviewSections: draft.overviewSections || [],
  };
};

const normalizeTemplateDefinition = (template?: ProjectWorkspaceTemplate | null) => {
  const fallback = buildDefaultTemplateDefinition();
  const definition = template?.definitionJson;
  return {
    tabs: Array.isArray(definition?.tabs) ? (definition.tabs as ProjectWorkspaceConfigTab[]) : fallback.tabs,
    overviewSections: Array.isArray(definition?.overviewSections) ? (definition.overviewSections as string[]) : fallback.overviewSections,
  };
};

export const WorkspaceTemplatesAdmin: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = React.useState(true);
  const [templates, setTemplates] = React.useState<ProjectWorkspaceTemplate[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [assignments, setAssignments] = React.useState<ClientWorkspaceTemplateAssignment[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState('');
  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [templateModalOpen, setTemplateModalOpen] = React.useState(false);
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    name: 'Client Workspace',
    description: 'Client-facing project workspace template.',
    audienceType: 'client' as WorkspaceAudienceType,
    status: 'DRAFT' as WorkspaceTemplateStatus,
    isDefault: false,
  });
  const [editorState, setEditorState] = React.useState({
    name: '',
    description: '',
    audienceType: 'client' as WorkspaceAudienceType,
    status: 'DRAFT' as WorkspaceTemplateStatus,
    isDefault: false,
    tabs: buildDefaultTemplateDefinition().tabs,
    overviewSections: [] as string[],
  });

  const prettyAudience = React.useCallback(
    (value: WorkspaceAudienceType) => t(`workspace_audience_${value}`),
    [t],
  );

  const prettyStatus = React.useCallback(
    (value: WorkspaceTemplateStatus) => t(`workspace_status_${value.toLowerCase()}`),
    [t],
  );

  const getTabStateLabel = React.useCallback(
    (value: typeof TAB_STATE_OPTIONS[number]['value']) => t(`workspace_tab_state_${value}`),
    [t],
  );

  const getGroupLabel = React.useCallback(
    (groupId: string) => t(`workspace_group_${groupId}`),
    [t],
  );

  const getTabLabel = React.useCallback(
    (tabId: string) => {
      const keyMap: Record<string, string> = {
        testing: 'testing_access',
      };
      return t(keyMap[tabId] || tabId);
    },
    [t],
  );

  const getTabNotes = React.useCallback(
    (tabId: string) => t(`workspace_tab_note_${tabId}`),
    [t],
  );

  const selectedTemplate = React.useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const dependencyWarnings = React.useMemo(
    () =>
      validateWorkspaceDependencies(
        editorState.tabs
          .filter((tab) => tab.state !== 'hidden')
          .map((tab) => tab.tabId as keyof typeof PROJECT_TABS_BY_ID),
      ),
    [editorState.tabs],
  );

  const templateSummary = React.useMemo(
    () =>
      summarizeWorkspaceDraft({
        audienceType: editorState.audienceType,
        tabs: editorState.tabs,
        overviewSections: editorState.overviewSections,
      }),
    [editorState.audienceType, editorState.overviewSections, editorState.tabs],
  );

  const activeAssignmentCount = React.useMemo(
    () => assignments.filter((assignment) => assignment.isActive).length,
    [assignments],
  );

  const loadAssignments = React.useCallback(async (clientId: string) => {
    if (!clientId) {
      setAssignments([]);
      return;
    }
    const data = await api.workspaceTemplatesAdmin.listClientAssignments(clientId);
    setAssignments(data);
  }, []);

  const loadData = React.useCallback(async (preferredTemplateId?: string) => {
    const [templateData, clientData] = await Promise.all([
      api.workspaceTemplatesAdmin.listTemplates(),
      api.clients.list(),
    ]);

    setTemplates(templateData);
    setClients(clientData);

    const nextTemplateId =
      preferredTemplateId && templateData.some((template) => template.id === preferredTemplateId)
        ? preferredTemplateId
        : templateData[0]?.id || '';
    const nextClientId = clientData[0]?.id || '';

    setSelectedTemplateId(nextTemplateId);
    setSelectedClientId((current) => current || nextClientId);

    if (nextClientId) {
      await loadAssignments(nextClientId);
    }
  }, [loadAssignments]);

  React.useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error(error);
        toast.error(t('workspace_error_load_templates'));
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [loadData]);

  React.useEffect(() => {
    if (!selectedClientId) return;
    loadAssignments(selectedClientId).catch((error) => {
      console.error(error);
      toast.error(t('workspace_error_load_assignments'));
    });
  }, [loadAssignments, selectedClientId]);

  React.useEffect(() => {
    if (!selectedTemplate) return;
    const definition = normalizeTemplateDefinition(selectedTemplate);
    setEditorState({
      name: selectedTemplate.name,
      description: selectedTemplate.description || '',
      audienceType: selectedTemplate.audienceType,
      status: selectedTemplate.status,
      isDefault: selectedTemplate.isDefault,
      tabs: definition.tabs,
      overviewSections: definition.overviewSections,
    });
  }, [selectedTemplate]);

  const updateTabState = (tabId: string, state: string) => {
    setEditorState((current) => {
      let nextTabs = current.tabs.map((tab) => (tab.tabId === tabId ? { ...tab, state: state as any } : tab));
      const changedDefinition = PROJECT_TABS_BY_ID[tabId as keyof typeof PROJECT_TABS_BY_ID];

      if (state === 'hidden') {
        const dependentTabIds = PROJECT_TAB_DEFINITIONS
          .filter((definition) => definition.dependsOn?.includes(tabId as any))
          .map((definition) => definition.id);

        if (dependentTabIds.length > 0) {
          nextTabs = nextTabs.map((tab) =>
            dependentTabIds.includes(tab.tabId as any) ? { ...tab, state: 'hidden' } : tab,
          );
        }
      }

      if (state !== 'hidden' && changedDefinition?.dependsOn?.length) {
        const missingParents = changedDefinition.dependsOn.filter((dependency) => {
          const parent = nextTabs.find((tab) => tab.tabId === dependency);
          return !parent || parent.state === 'hidden';
        });

        if (missingParents.length > 0) {
          nextTabs = nextTabs.map((tab) =>
            missingParents.includes(tab.tabId as any)
              ? { ...tab, state: state === 'visible_interactive' ? 'visible_interactive' : 'visible_read_only' }
              : tab,
          );
          toast.success(
            `${t('workspace_enabled_dependencies_prefix')} ${missingParents
              .map((dependency) => PROJECT_TABS_BY_ID[dependency]?.label || dependency)
              .map((dependency) => getTabLabel(dependency))
              .join(', ')} ${t('workspace_enabled_dependencies_suffix')} ${getTabLabel(changedDefinition.id)}.`,
          );
        }
      }

      return {
        ...current,
        tabs: nextTabs,
      };
    });
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    setSavingTemplate(true);
    try {
      const updated = await api.workspaceTemplatesAdmin.updateTemplate(selectedTemplate.id, {
        name: editorState.name,
        description: editorState.description,
        audienceType: editorState.audienceType,
        status: editorState.status,
        isDefault: editorState.isDefault,
        definitionJson: {
          tabs: editorState.tabs,
          overviewSections: editorState.overviewSections,
        },
      });
      toast.success(t('workspace_success_saved'));
      await loadData(updated.id);
    } catch (error) {
      console.error(error);
      toast.error(t('workspace_error_save_template'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleCreateTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTemplate(true);
    try {
      const created = await api.workspaceTemplatesAdmin.createTemplate({
        ...createForm,
        definitionJson: buildDefaultTemplateDefinition(),
      });
      toast.success(t('workspace_success_created'));
      setTemplateModalOpen(false);
      await loadData(created.id);
    } catch (error) {
      console.error(error);
      toast.error(t('workspace_error_create_template'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleAssignTemplate = async () => {
    if (!selectedClientId || !selectedTemplate) return;
    try {
      await api.workspaceTemplatesAdmin.createClientAssignment(selectedClientId, {
        templateId: selectedTemplate.id,
        isDefault: true,
        isActive: true,
      });
      toast.success(t('workspace_success_assigned'));
      await loadAssignments(selectedClientId);
    } catch (error) {
      console.error(error);
      toast.error(t('workspace_error_assign_template'));
    }
  };

  const handleToggleAssignment = async (
    assignment: ClientWorkspaceTemplateAssignment,
    payload: { isDefault?: boolean; isActive?: boolean },
  ) => {
    try {
      await api.workspaceTemplatesAdmin.updateClientAssignment(assignment.id, payload);
      await loadAssignments(selectedClientId);
    } catch (error) {
      console.error(error);
      toast.error(t('workspace_error_update_assignment'));
    }
  };

  if (![Role.SUPER_ADMIN, Role.OPS].includes(user?.role as Role)) {
    return (
      <GlassCard className="max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('workspace_builder')}</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {t('workspace_builder_restricted')}
        </p>
      </GlassCard>
    );
  }

  if (isLoading) {
    return <div className="p-10 text-center text-slate-500">{t('workspace_loading_templates')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('workspace_builder')}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {t('workspace_builder_subtitle')}
          </p>
        </div>
        <Button onClick={() => setTemplateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('workspace_new_template')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('workspace_templates')}</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{templates.length}</p>
            </div>
            <Layers3 className="h-5 w-5 text-cyan-500" />
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('workspace_templates_caption')}</p>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('workspace_client_assignments')}</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{activeAssignmentCount}</p>
            </div>
            <Users className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('workspace_client_assignments_caption')}</p>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('workspace_template_coverage')}</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{templateSummary.interactiveCount + templateSummary.readOnlyCount}</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[hsl(var(--brand-success))]" />
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {t('workspace_coverage_summary', {
              interactive: templateSummary.interactiveCount,
              readOnly: templateSummary.readOnlyCount,
              hidden: templateSummary.hiddenCount,
            })}
          </p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers3 className="h-4 w-4 text-cyan-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('workspace_templates')}</h2>
          </div>
          <div className="space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedTemplateId === template.id
                    ? 'border-cyan-400 bg-cyan-50 dark:border-cyan-500/40 dark:bg-cyan-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{template.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{template.description || t('workspace_no_description')}</p>
                  </div>
                  {template.isDefault && <Badge variant="info">{t('workspace_default')}</Badge>}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <Badge variant="neutral">{prettyAudience(template.audienceType)}</Badge>
                  <Badge variant="neutral">{prettyStatus(template.status)}</Badge>
                </div>
              </button>
            ))}
            {templates.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t('workspace_no_templates')}
              </div>
            )}
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('workspace_template_editor')}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {t('workspace_template_editor_caption')}
                </p>
              </div>
              <Button onClick={handleSaveTemplate} disabled={!selectedTemplate || savingTemplate}>
                <Save className="mr-2 h-4 w-4" />
                {t('workspace_save_template')}
              </Button>
            </div>

            {selectedTemplate ? (
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('workspace_name')}</Label>
                    <Input value={editorState.name} onChange={(event) => setEditorState((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div>
                    <Label>{t('workspace_audience')}</Label>
                    <Select value={editorState.audienceType} onChange={(event) => setEditorState((current) => ({ ...current, audienceType: event.target.value as WorkspaceAudienceType }))}>
                      {AUDIENCE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {prettyAudience(option)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>{t('workspace_status')}</Label>
                    <Select value={editorState.status} onChange={(event) => setEditorState((current) => ({ ...current, status: event.target.value as WorkspaceTemplateStatus }))}>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {prettyStatus(option)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mt-6">
                    <input
                      type="checkbox"
                      checked={editorState.isDefault}
                      onChange={(event) => setEditorState((current) => ({ ...current, isDefault: event.target.checked }))}
                    />
                    {t('workspace_default_org_template')}
                  </label>
                </div>

                <div>
                  <Label>{t('workspace_description')}</Label>
                  <TextArea value={editorState.description} onChange={(event) => setEditorState((current) => ({ ...current, description: event.target.value }))} rows={3} />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('workspace_interactive')}</p>
                    <p className="mt-2 text-2xl font-black text-[hsl(var(--brand-success))] dark:text-[hsl(var(--brand-success))]">{templateSummary.interactiveCount}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('workspace_read_only')}</p>
                    <p className="mt-2 text-2xl font-black text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]">{templateSummary.readOnlyCount}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('workspace_hidden')}</p>
                    <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{templateSummary.hiddenCount}</p>
                  </div>
                </div>

                {dependencyWarnings.length > 0 && (
                  <div className="rounded-2xl border border-[hsl(var(--brand-warning)/0.2)] bg-[hsl(var(--brand-warning)/0.1)] p-4 dark:border-[hsl(var(--brand-warning)/0.2)] dark:bg-[hsl(var(--brand-warning)/0.1)]">
                    <p className="text-sm font-bold text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]">{t('workspace_dependency_warnings')}</p>
                    <div className="mt-2 space-y-2 text-sm text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]">
                      {dependencyWarnings.map((warning) => (
                        <p key={warning.tabId}>
                          <span className="font-semibold">{getTabLabel(warning.tabId)}</span> {t('workspace_depends_on')}{' '}
                          {warning.missingDependencies.map((dependency) => getTabLabel(dependency)).join(', ')}.
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                  {[{ title: t('workspace_primary_tabs'), items: VISIBLE_PRIMARY_TEMPLATE_TAB_DEFINITIONS }, { title: t('workspace_dependent_tabs'), items: VISIBLE_SECONDARY_TEMPLATE_TAB_DEFINITIONS }].map((section) => (
                    <div key={section.title} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{section.title}</h3>
                      <div className="mt-4 space-y-4">
                        {PROJECT_TAB_GROUPS.map((group) => {
                          const groupItems = section.items.filter((item) => item.group === group.id);
                          if (groupItems.length === 0) return null;
                          return (
                            <div key={group.id} className="space-y-3">
                              <p className={`text-[11px] font-black uppercase tracking-widest ${group.color}`}>{getGroupLabel(group.id)}</p>
                              {groupItems.map((tabDefinition) => {
                                const tabState = editorState.tabs.find((tab) => tab.tabId === tabDefinition.id)?.state || 'hidden';
                                return (
                                  <div key={tabDefinition.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{getTabLabel(tabDefinition.id)}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getTabNotes(tabDefinition.id)}</p>
                                      </div>
                                      <div className="min-w-[170px]">
                                        <Select value={tabState} onChange={(event) => updateTabState(tabDefinition.id, event.target.value)}>
                                          {TAB_STATE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {getTabStateLabel(option.value)}
                                            </option>
                                          ))}
                                        </Select>
                                      </div>
                                    </div>
                                    {tabDefinition.dependsOn?.length ? (
                                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        {t('workspace_depends_on')} {tabDefinition.dependsOn.map((dependency) => getTabLabel(dependency)).join(', ')}
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">{t('workspace_create_template_prompt')}</p>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('workspace_client_assignment')}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {t('workspace_client_assignment_caption')}
                </p>
              </div>
              <Button onClick={handleAssignTemplate} disabled={!selectedClientId || !selectedTemplate}>
                <Link2 className="mr-2 h-4 w-4" />
                {t('workspace_assign_selected_template')}
              </Button>
            </div>

            {clients.length > 0 ? (
              <div className="mt-4 max-w-md">
                <Label>{t('label_client')}</Label>
                <Select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t('workspace_no_clients')}
              </div>
            )}

            <div className="mt-6 space-y-3">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{assignment.template.name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('workspace_assignment_summary', {
                          audience: prettyAudience(assignment.template.audienceType),
                          assignedAt: new Date(assignment.assignedAt).toLocaleString(),
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {assignment.isDefault && <Badge variant="info">{t('workspace_default')}</Badge>}
                      <Badge variant={assignment.isActive ? 'success' : 'neutral'}>{assignment.isActive ? t('workspace_active') : t('workspace_inactive')}</Badge>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!assignment.isDefault && (
                      <Button variant="secondary" size="sm" onClick={() => handleToggleAssignment(assignment, { isDefault: true, isActive: true })}>
                        {t('workspace_make_default')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleAssignment(assignment, { isActive: !assignment.isActive })}
                    >
                      {assignment.isActive ? t('workspace_deactivate') : t('workspace_activate')}
                    </Button>
                  </div>
                </div>
              ))}
              {clients.length > 0 && assignments.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {t('workspace_no_assignments')}
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      <Modal isOpen={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={t('workspace_new_template')}>
        <form className="space-y-4" onSubmit={handleCreateTemplate}>
          <div>
            <Label>{t('workspace_name')}</Label>
            <Input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div>
            <Label>{t('workspace_description')}</Label>
            <TextArea value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t('workspace_audience')}</Label>
              <Select value={createForm.audienceType} onChange={(event) => setCreateForm((current) => ({ ...current, audienceType: event.target.value as WorkspaceAudienceType }))}>
                {AUDIENCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {prettyAudience(option)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('workspace_status')}</Label>
              <Select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value as WorkspaceTemplateStatus }))}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {prettyStatus(option)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={createForm.isDefault}
              onChange={(event) => setCreateForm((current) => ({ ...current, isDefault: event.target.checked }))}
            />
            {t('workspace_set_default_org_template')}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setTemplateModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={savingTemplate}>
              {t('workspace_create_template')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default WorkspaceTemplatesAdmin;
