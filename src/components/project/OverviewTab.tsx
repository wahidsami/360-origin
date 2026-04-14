import React from 'react';
import { useTranslation } from 'react-i18next';
import { Project, Milestone, Task, ProjectReadiness, ReadinessAction, Role } from '@/types';
import { GlassCard, Badge, Button } from '../ui/UIComponents';
import { Activity, Flag, ArrowRight, CheckCircle, AlertCircle, PlusCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface OverviewTabProps {
    project: Project;
    stats?: {
        taskCount: number;
        completedTasks: number;
        overdueTasks: number;
        milestoneCount: number;
        completedMilestones: number;
        atRiskMilestones: number;
        findingCount: number;
        unresolvedFindings: number;
    };
    tasks?: any[]; // Full Task objects for inline previews
    findings?: any[]; // For severity analysis inside component
    milestones?: any[]; // For next milestone logic
    onAction?: (action: ReadinessAction) => void;
    onNavigate?: (tab: string) => void; // Keep for backward compatibility/quick links
    allowedTabs?: string[];
    readiness?: ProjectReadiness | null;
    metrics?: any;
    activity?: any[];
    hiddenOverviewSections?: string[];
}

// --- NEW SUB-COMPONENTS ---
function ChecklistSection({ title, items, isComplete, onAction, onNavigate }: { title: string, items: any[], isComplete: boolean, onAction?: any, onNavigate?: any }) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = React.useState(!isComplete);

    return (
        <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800/60 p-5 flex h-full flex-col shadow-sm hover:shadow-md transition-all">
            <div
                className="flex items-center justify-between cursor-pointer mb-2"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="bg-cyan-500/10 text-cyan-400 border-cyan-400/20 uppercase text-[9px] tracking-widest font-black">{title}</Badge>
                    <CheckCircle className={`w-3.5 h-3.5 ${isComplete ? 'text-[hsl(var(--brand-success))]' : 'text-slate-700'}`} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold">{items.filter(i => i.status === 'complete').length}/{items.length}</span>
                    <span className="text-slate-500 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                </div>
            </div>

            {isExpanded && (
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 pr-2 mt-2 font-sans">
                    {items.filter(i => i.status !== 'not_applicable').map((item) => (
                        <div key={item.id} className={`flex items-center gap-3 p-1.5 rounded transition-colors ${item.status === 'complete' ? 'opacity-40' : item.status === 'missing' && item.type === 'required' ? 'bg-rose-50 border border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20' : 'bg-slate-50 dark:bg-slate-800/20'}`}>
                            <div className="shrink-0">
                                {item.status === 'complete' ? <CheckCircle className="w-3 h-3 text-slate-400" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />}
                            </div>
                            <div className="flex-grow flex justify-between items-center break-all text-left">
                                <span className={`text-[10px] font-bold tracking-wider ${item.status === 'complete' ? 'text-slate-400' : item.status === 'missing' && item.type === 'required' ? 'text-rose-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{item.label}</span>
                                {item.action && item.status !== 'complete' && (
                                    <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-black text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 px-2" onClick={(e) => { e.stopPropagation(); if (item.action.type === 'navigate_tab') { onNavigate?.(item.action.target); } else { onAction?.(item.action); } }}>
                                        {t('fix_arrow')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ActivityFeed({ activities }: { activities: any[] }) {
    const { t } = useTranslation();
    const condensedActivities = React.useMemo(() => {
        const grouped: Array<any & { count: number; groupKey: string }> = [];

        for (const activity of activities) {
            const groupKey = [
                activity.entityId || '',
                activity.type || '',
                activity.action || '',
                activity.description || ''
            ].join('::');
            const previous = grouped[grouped.length - 1];

            if (previous && previous.groupKey === groupKey) {
                previous.count += 1;
                continue;
            }

            grouped.push({ ...activity, count: 1, groupKey });
        }

        return grouped.slice(0, 5);
    }, [activities]);
    const getActivityIcon = (type: string) => {
        const icons: Record<string, string> = { task_overdue: '⏰', task_completed: '✅', finding_created: '📝', milestone_completed: '🎯', milestone_missed: '⚠️', budget_alert: '💰', member_added: '👤', file_uploaded: '📄', update_posted: '📢', blocker_created: '🚧' };
        return icons[type] || '•';
    };

    return (
        <GlassCard className="p-6 border-slate-200 dark:border-slate-800 bg-white">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">{t('recent_activity')}</h4>
            <div className="space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 pr-2">
                {condensedActivities.map(activity => (
                    <div key={activity.id} className="flex gap-3 text-sm">
                        <div className="shrink-0 w-6 h-6 flex justify-center items-center bg-slate-50 dark:bg-slate-800/50 rounded-full text-[10px] border border-slate-200 dark:border-slate-700">
                            {getActivityIcon(activity.action || activity.type)}
                        </div>
                        <div className="flex-grow">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[10px] text-slate-400 mb-0.5 font-bold uppercase tracking-tighter">{formatDistanceToNow(new Date(activity.createdAt || activity.timestamp || Date.now()), { addSuffix: true })}</p>
                                {activity.count > 1 && (
                                    <Badge variant="neutral" className="text-[9px] px-1.5 py-0.5 font-black uppercase tracking-widest">
                                        x{activity.count}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-normal">{activity.description || t('action_performed')}</p>
                        </div>
                    </div>
                ))}
                {condensedActivities.length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">{t('no_recent_activity')}</p>}
            </div>
        </GlassCard>
    );
}

function calculateVelocity(tasks: any[]) {
    const completedTasks = tasks.filter(t => t.status?.toLowerCase() === 'done' && (t.completedAt || t.updatedAt));
    if (completedTasks.length === 0) return 0;

    const oldestCompletion = new Date(Math.min(...completedTasks.map(t => new Date(t.completedAt || t.updatedAt).getTime())));
    const daysSinceFirstCompletion = (Date.now() - oldestCompletion.getTime()) / (1000 * 60 * 60 * 24);

    return completedTasks.length / Math.max(daysSinceFirstCompletion, 1);
}

function PredictiveInsights({ project, tasks, milestones, metrics }: { project: any, tasks: any[], milestones: any[], metrics: any }) {
    const { t } = useTranslation();
    const insights = React.useMemo(() => {
        const predictions: any[] = [];

        // Completion date prediction
        const completedTasks = tasks.filter(t => t.status?.toLowerCase() === 'done').length;
        const totalTasks = tasks.length;
        const velocity = calculateVelocity(tasks);

        if (velocity > 0 && totalTasks > completedTasks) {
            const remainingTasks = totalTasks - completedTasks;
            const daysToComplete = Math.ceil(remainingTasks / velocity);
            const projectedDate = new Date(Date.now() + daysToComplete * 24 * 60 * 60 * 1000);
            const plannedDate = new Date(project.deadline || project.endDate || Date.now());
            const variance = Math.ceil((projectedDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));

            if (variance > 0) {
                predictions.push({
                    type: 'schedule_risk',
                    severity: variance > 14 ? 'high' : 'medium',
                    message: t('at_current_velocity_projected_completion', { date: projectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }),
                    impact: t('days_late', { count: variance }),
                    icon: '📊'
                });
            }
        }

        // Unassigned blocker detection
        const unassignedTasks = tasks.filter(t => (!t.assigneeId && !t.assignee) && t.status?.toLowerCase() !== 'done');
        const dependentTasks = tasks.filter((t: any) =>
            t.dependencies?.some((depId: string) => unassignedTasks.find(ut => ut.id === depId)) ||
            project.taskDependencies?.some((td: any) => td.dependentTaskId === t.id && unassignedTasks.find(ut => ut.id === td.dependsOnId))
        );

        if (unassignedTasks.length > 0 && dependentTasks.length > 0) {
            predictions.push({
                type: 'assignment_gap',
                severity: 'medium',
                message: t('unassigned_tasks_blocking_dependent_items', { tasks: unassignedTasks.length, dependents: dependentTasks.length }),
                impact: t('work_cannot_proceed'),
                icon: '👤'
            });
        }

        return predictions;
    }, [project, tasks, milestones, metrics]);

    if (insights.length === 0) return null;

    return (
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-6 flex flex-col gap-3 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🔮</span>
                <h3 className="text-[11px] font-black tracking-widest uppercase text-slate-900 dark:text-slate-400">{t('predictive_insights')}</h3>
            </div>
            <div className="space-y-2">
                {insights.map((insight, idx) => (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border ${insight.severity === 'high' ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20 text-rose-700 dark:text-rose-300' : 'bg-[hsl(var(--brand-warning)/0.1)] dark:bg-[hsl(var(--brand-warning)/0.1)] border-[hsl(var(--brand-warning)/0.2)] dark:border-[hsl(var(--brand-warning)/0.2)] text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]'}`}>
                        <span className="text-lg mt-0.5">{insight.icon}</span>
                        <div>
                            <p className="text-sm font-bold leading-tight mb-0.5">{insight.message}</p>
                            <p className="text-[10px] uppercase font-black tracking-wider opacity-60">{insight.impact}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QuickActionsPanel({ project, onNavigate, onAction, onRefresh, overdueCount, allowedTabs = [] }: { project: any, onNavigate?: any, onAction?: any, onRefresh?: () => void, overdueCount: number, allowedTabs?: string[] }) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = React.useState(false);
    const canSee = (id: string) => allowedTabs.includes(id);
    const { user } = useAuth();
    const clientRoles = [Role.CLIENT_OWNER, Role.CLIENT_MANAGER, Role.CLIENT_MEMBER];
    const isClient = !!user && clientRoles.includes(user.role);
    const hasDeadline = !!(project?.deadline || project?.endDate);

    if (isClient) return null;

    return (
        <div className="relative">
            <Button
                onClick={() => setIsOpen(!isOpen)}
                variant="primary"
                className="bg-cyan-500 hover:bg-cyan-600 text-slate-900 border-none shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] font-black uppercase tracking-widest text-[10px] px-6 h-10 transition-all rounded-xl"
            >
                {t('quick_actions_btn')}
            </Button>

            {isOpen && (
                <div className="absolute top-12 right-0 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col p-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    {canSee('tasks') && !isClient && (
                        <button onClick={() => { setIsOpen(false); onNavigate?.('tasks'); }} className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors">
                            <PlusCircle className="w-4 h-4 text-[hsl(var(--brand-success))]" /> {t('add_task')}
                        </button>
                    )}
                    {!isClient && (
                        <button onClick={() => { setIsOpen(false); onAction?.({ type: 'open_edit_project' }); }} className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors">
                            <span className="text-[hsl(var(--brand-warning))]">📅</span> {t(hasDeadline ? 'edit_deadline' : 'set_deadline')}
                        </button>
                    )}
                    {canSee('updates') && (
                        <button onClick={() => { setIsOpen(false); onNavigate?.('updates'); }} className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors">
                            <span className="text-cyan-600">📋</span> {t('post_update_short')}
                        </button>
                    )}
                    {canSee('findings') && !isClient && (
                        <button onClick={() => { setIsOpen(false); onNavigate?.('findings'); }} className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors">
                            <span className="text-rose-500">⚠️</span> {t('log_risk_finding')}
                        </button>
                    )}

                    {canSee('tasks') && !isClient && overdueCount > 0 && (
                        <button onClick={() => { setIsOpen(false); onNavigate?.('tasks'); }} className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[11px] font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-colors mt-1 border border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/5">
                            <span>✅</span> {t('complete_overdue')} ({overdueCount})
                        </button>
                    )}

                    <button onClick={() => {
                        setIsOpen(false);
                        if (onRefresh) onRefresh();
                    }}
                        className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors"
                    >
                        <span className="text-blue-600">🔄</span> {t('refresh_data')}
                    </button>
                </div>
            )}
        </div>
    );
}

export const OverviewTab: React.FC<OverviewTabProps & { onRefresh?: () => void }> = ({ project, stats, tasks = [], findings = [], milestones = [], onAction, onNavigate, onRefresh, allowedTabs = [], readiness, metrics, activity = [], hiddenOverviewSections = [] }) => {
    const { t } = useTranslation();
    const hiddenOverviewSectionSet = React.useMemo(() => new Set(hiddenOverviewSections), [hiddenOverviewSections]);
    const showSection = React.useCallback((sectionId: string) => !hiddenOverviewSectionSet.has(sectionId), [hiddenOverviewSectionSet]);
    const canSee = (tabId: string) => allowedTabs.includes(tabId);
    const filterReadinessItems = React.useCallback(
        (items: any[] = []) =>
            items.filter((item) => {
                if (!item?.tab) return true;
                return canSee(item.tab);
            }),
        [allowedTabs],
    );
    // Derived operational metrics
    const taskCount = stats?.taskCount || 0;
    const completedTasks = stats?.completedTasks || 0;
    const overdueTasks = stats?.overdueTasks || 0;
    const activeTasks = Math.max(0, taskCount - completedTasks - overdueTasks);

    const formatRelativeDate = (date: string) => {
        const due = new Date(date);
        due.setHours(23, 59, 59, 999);
        const days = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days === 0) return t('today');
        if (days === 1) return t('tomorrow');
        if (days > 1 && days < 7) return t('in_n_days', { count: days });
        return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const taskPreviews = (tasks || [])
        .filter(t => t.status?.toLowerCase() !== 'done')
        .map(t => {
            let isOverdue = false;
            let daysRef = Infinity;
            let dueText = t('no_due_date');

            if (t.dueDate) {
                const due = new Date(t.dueDate);
                due.setHours(23, 59, 59, 999);
                const now = new Date();

                daysRef = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                isOverdue = daysRef < 0;

                if (isOverdue) {
                    const daysLate = Math.ceil(Math.abs(daysRef));
                    dueText = t('days_late', { count: daysLate });
                } else {
                    dueText = t('due_prefix', { date: formatRelativeDate(t.dueDate) });
                }
            }

            return { ...t, isOverdue, daysRef, dueText };
        })
        .sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            return a.daysRef - b.daysRef;
        });

    const milestoneCount = stats?.milestoneCount || 0;
    const completedMilestones = stats?.completedMilestones || 0;
    const atRiskMilestones = stats?.atRiskMilestones || 0;
    const milestoneRiskLabel = atRiskMilestones > 0
        ? t('at_risk_count', { count: atRiskMilestones })
        : milestoneCount > 0
            ? t('done_count_summary', { completed: completedMilestones, total: milestoneCount })
            : t('no_milestones');

    const findingCount = stats?.findingCount || 0;
    const unresolvedFindings = stats?.unresolvedFindings || 0;
    const resolvedFindings = Math.max(0, findingCount - unresolvedFindings);

    const findingsBySeverity = (findings || []).reduce((acc: any, f) => {
        const status = f.status?.toUpperCase();
        if (status !== 'CLOSED' && status !== 'DISMISSED') {
            const sev = f.severity?.toUpperCase() || 'LOW';
            acc[sev] = (acc[sev] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const openFindings = (findings || []).filter(f => !['CLOSED', 'DISMISSED'].includes(f.status?.toUpperCase()));
    const mostCriticalFinding = openFindings.sort((a, b) => {
        const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (severityOrder[a.severity?.toUpperCase()] ?? 4) - (severityOrder[b.severity?.toUpperCase()] ?? 4);
    })[0];

    const readinessSections = React.useMemo(() => {
        const coreItems = filterReadinessItems(readiness?.sections.core.items || []);
        const planningItems = filterReadinessItems(readiness?.sections.planning.items || []);
        const resourceItems = filterReadinessItems(readiness?.sections.resources.items || []);
        return {
            coreItems,
            planningItems,
            resourceItems,
        };
    }, [filterReadinessItems, readiness]);

    const filteredNextAction = React.useMemo(() => {
        if (!readiness?.nextAction) return null;
        if (readiness.nextAction.tab && !canSee(readiness.nextAction.tab)) return null;
        if (readiness.nextAction.action?.type === 'navigate_tab' && readiness.nextAction.action.target && !canSee(readiness.nextAction.action.target)) {
            return null;
        }
        return readiness.nextAction;
    }, [allowedTabs, readiness]);

    const criticalFindingCount = findingsBySeverity.CRITICAL || 0;
    const criticalFindingAlert = (filteredNextAction as any)?.type === 'critical_findings' ? filteredNextAction as any : null;
    const activeBlockerCount = metrics?.blockers?.active?.length || 0;
    const capacityMembers = metrics?.capacity?.members || [];
    const highLoadMembers = metrics?.capacity?.highLoad || [];
    const availableMembers = metrics?.capacity?.available || [];

    return (
        <div className="space-y-8 pb-12">
            <div className="flex justify-between items-center w-full border-b border-slate-200 dark:border-slate-800 pb-4 mb-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white px-2">{t('project_dashboard')}</h2>
                <QuickActionsPanel project={project} onNavigate={onNavigate} onAction={onAction} onRefresh={onRefresh} overdueCount={overdueTasks} allowedTabs={allowedTabs} />
            </div>

            {/* TOP SECTION */}
            <div className="space-y-6">
                {/* Stage & Status Banner */}
                <GlassCard className="p-0 overflow-hidden border-cyan-200 dark:border-cyan-500/20 bg-gradient-to-br from-white via-white to-cyan-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-500/5 shadow-md border-l-4 border-l-cyan-400 dark:border-l-cyan-500">
                    <div className="flex flex-col md:flex-row h-full">
                        {/* Status Sidebar */}
                        <div className="w-full md:w-48 bg-cyan-500/10 flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r border-cyan-500/20">
                            <div className="p-3 bg-cyan-500/20 rounded-2xl text-cyan-400 mb-3 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                                <Activity className="w-8 h-8" />
                            </div>
                            <Badge variant={project.status === 'in_progress' ? 'info' : project.status === 'completed' ? 'success' : 'neutral'} className="px-3 py-1 text-xs uppercase tracking-widest font-black">
                                {t(`status_${project.status.toLowerCase()}`, { defaultValue: project.status.replace(/_/g, ' ') })}
                            </Badge>
                            <p className="text-[10px] text-cyan-400/60 font-bold mt-2 uppercase tracking-tighter">{t('current_status')}</p>
                        </div>

                        {/* Stage Progress */}
                        <div className="flex-grow p-6 flex flex-col justify-center gap-6">
                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,1fr)_auto_320px] gap-6 items-center">
                                <div className="space-y-1 xl:self-start">
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                        {t('stage')}: <span className="text-cyan-600 dark:text-cyan-400">{t(`stage_${(readiness?.stage || 'SETUP').toLowerCase()}`).toUpperCase()}</span>
                                    </h2>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                                        {t(`stage_desc_${(readiness?.stage || 'SETUP').toLowerCase()}`, { defaultValue: readiness?.stageExplanation || 'Initial project parameters and team setup required.' })}
                                    </p>
                                </div>

                                <div className="order-3 xl:order-none flex w-full items-center justify-center gap-0 pt-2 pb-6 xl:py-0 xl:self-center">
                                    {['SETUP', 'PLANNING', 'ACTIVE', 'REVIEW', 'DONE'].map((s, idx) => {
                                        const stages = ['SETUP', 'PLANNING', 'ACTIVE', 'REVIEW', 'DONE', 'READY_FOR_BILLING'];
                                        const isCurrent = (readiness?.stage || 'SETUP') === s;
                                        const isPassed = stages.indexOf(readiness?.stage || 'SETUP') > idx;
                                        return (
                                            <div key={s} className="flex items-center">
                                                <div className="flex flex-col items-center relative">
                                                    <div
                                                        className={`w-4 h-4 rounded-full border-2 z-10 ${isCurrent ? 'bg-cyan-400 border-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.8)]' : isPassed ? 'bg-[hsl(var(--brand-success))] border-[hsl(var(--brand-success)/0.25)]' : 'bg-slate-800 border-slate-600'}`}
                                                        title={t(`stage_${s.toLowerCase()}`)}
                                                    />
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap ${isCurrent ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : isPassed ? 'text-[hsl(var(--brand-success)/0.9)]' : 'text-slate-500'}`}>
                                                        {t(`stage_${s.toLowerCase()}`)}
                                                    </span>
                                                </div>
                                                {idx < 4 && <div className={`w-8 sm:w-12 h-0.5 ${isPassed ? 'bg-[hsl(var(--brand-success)/0.6)]' : 'bg-slate-700'}`} />}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="rounded-2xl border border-cyan-200/70 dark:border-cyan-500/20 bg-white/80 dark:bg-slate-900/60 p-5 shadow-sm xl:self-start">
                                    <div className="flex items-center gap-4">
                                        <div className="relative w-20 h-20 shrink-0">
                                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                                <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                                                <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * (1 - (readiness?.completeness || 0) / 100)} className="text-cyan-500 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.2)]" strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                                <span className="text-xl font-black text-slate-900 dark:text-white">{readiness?.completeness || 0}%</span>
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('workflow_readiness', { defaultValue: 'WORKFLOW READINESS' })}</h4>
                                            <p className="text-sm font-black text-slate-900 dark:text-white">{readiness?.stats?.completedRequired || 0} of {readiness?.stats?.totalRequired || 0} {t('setup_checks_complete')}</p>
                                            <p className="text-[10px] text-cyan-600 dark:text-cyan-400/80 font-bold mt-1">{readiness?.stageExplanation || 'Initial project parameters and team setup required.'}</p>
                                            <p className={`text-[10px] font-black uppercase tracking-widest mt-2 ${activeBlockerCount > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-[hsl(var(--brand-success))] dark:text-[hsl(var(--brand-success))]'}`}>
                                                {activeBlockerCount > 0 ? `${activeBlockerCount} active blockers flagged` : 'No active blockers'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Predictive Insights */}
                            {showSection('predictive_insights') && (
                                <PredictiveInsights project={project} tasks={tasks} milestones={milestones} metrics={metrics} />
                            )}
                        </div>
                    </div>
                </GlassCard>

                {showSection('readiness_checklist') && (
                    <GlassCard className="p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col gap-4">
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('checklist')}</h4>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {readinessSections.coreItems.length > 0 && <ChecklistSection
                                      title={t('core_setup')}
                                      items={readinessSections.coreItems}
                                      isComplete={readinessSections.coreItems.every((i: any) => i.status === 'complete') || false}
                                      onAction={onAction}
                                      onNavigate={onNavigate}
                                  />}
                                {readinessSections.planningItems.length > 0 && <ChecklistSection
                                      title={t('planning')}
                                      items={readinessSections.planningItems}
                                      isComplete={readinessSections.planningItems.every((i: any) => i.status !== 'missing') || false}
                                      onAction={onAction}
                                      onNavigate={onNavigate}
                                  />}
                                {readinessSections.resourceItems.length > 0 && <ChecklistSection
                                      title={t('resources')}
                                      items={readinessSections.resourceItems}
                                      isComplete={readinessSections.resourceItems.every((i: any) => i.status !== 'missing') || false}
                                      onAction={onAction}
                                      onNavigate={onNavigate}
                                  />}
                              </div>
                          </div>
                    </GlassCard>
                )}
            </div>

            {(showSection('tasks_panel') || showSection('quality_panel')) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Task Health */}
                {showSection('tasks_panel') && (
                <GlassCard className={`p-6 border-t-4 border-t-blue-500 dark:border-slate-800 bg-white transition-colors flex flex-col h-full ${canSee('tasks') ? 'hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer group' : ''}`} onClick={() => canSee('tasks') && onNavigate?.('tasks')}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400 shadow-sm transition-transform group-hover:scale-110">
                                <CheckCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="text-3xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">{taskCount - completedTasks}</span>
                                <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">{t('active_tasks')}</h3>
                            </div>
                        </div>
                        {overdueTasks > 0 && <Badge variant="danger" className="text-[9px] px-1.5 py-0.5 font-bold shadow-sm">{overdueTasks} {t('overdue')}</Badge>}
                    </div>

                    <div className="space-y-3 mb-5">
                        <div className="flex h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                            <div className="bg-[hsl(var(--brand-success))] transition-all duration-500" style={{ width: `${(completedTasks / (taskCount || 1)) * 100}%` }} title={t('done')} />
                            <div className="bg-blue-500 transition-all duration-500" style={{ width: `${(activeTasks / (taskCount || 1)) * 100}%` }} title={t('active')} />
                            <div className="bg-rose-500 transition-all duration-500" style={{ width: `${(overdueTasks / (taskCount || 1)) * 100}%` }} title={t('overdue')} />
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                            <span className="text-[hsl(var(--brand-success))] dark:text-[hsl(var(--brand-success)/0.8)]">{completedTasks} {t('done')}</span>
                            <span className="text-blue-600 dark:text-blue-400/80">{activeTasks} {t('active')}</span>
                            <span className={overdueTasks > 0 ? 'text-rose-600 dark:text-rose-400/80' : ''}>{overdueTasks} {t('overdue')}</span>
                        </div>
                    </div>

                    <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="p-2 rounded-lg bg-[hsl(var(--brand-warning)/0.1)] dark:bg-[hsl(var(--brand-warning)/0.1)] text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))]">
                                    <Flag className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('milestones')}</p>
                                    <p className="text-sm font-black text-slate-900 dark:text-white">{milestoneCount}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${atRiskMilestones > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {milestoneRiskLabel}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{completedMilestones} {t('completed')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-grow space-y-2 mt-auto">
                        {taskPreviews.slice(0, 3).map((task) => (
                            <div key={task.id} className={`flex flex-col gap-1 text-xs p-2.5 rounded-xl border transition-all ${task.isOverdue ? 'bg-rose-50 dark:bg-rose-500/5 border-rose-100 dark:border-rose-500/10' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/50 hover:border-slate-200'}`}>
                                <span className={`font-bold truncate ${task.isOverdue ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'}`}>{task.title}</span>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-500 font-medium truncate max-w-[100px] opacity-80">{task.assigneeName || task.assignee?.name || 'Unassigned'}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${task.isOverdue ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`}>
                                        {task.dueText}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {taskPreviews.length > 3 && canSee('tasks') && (
                        <div className="mt-4 text-center">
                            <span className="text-[10px] text-cyan-600 dark:text-cyan-500/80 hover:text-cyan-700 font-black uppercase tracking-widest group-hover:underline">View all {taskPreviews.length} tasks &rarr;</span>
                        </div>
                    )}
                </GlassCard>
                )}

                {/* Findings Summary */}
                {showSection('quality_panel') && (
                <GlassCard className={`p-6 border-t-4 border-t-rose-500 dark:border-slate-800 bg-white transition-colors flex flex-col h-full ${canSee('findings') ? 'hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer group' : ''}`} onClick={() => canSee('findings') && onNavigate?.('findings')}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl text-rose-600 dark:text-rose-400 shadow-sm transition-transform group-hover:scale-110">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">{t('quality')}</h3>
                        </div>
                        <Badge variant={unresolvedFindings > 0 ? 'warning' : 'success'} className="text-[9px] px-1.5 py-0.5 font-bold shadow-sm">
                            {unresolvedFindings} {t('open')}
                        </Badge>
                    </div>

                    {criticalFindingCount > 0 && (
                        <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-1">{t('critical_alert')}</p>
                                    <p className="text-sm font-black text-rose-700 dark:text-rose-300">{t('critical_findings_need_attention', { count: criticalFindingCount, suffix: criticalFindingCount === 1 ? '' : 's' })}</p>
                                    <p className="text-xs text-rose-700/80 dark:text-rose-300/80 truncate mt-1">
                                        {mostCriticalFinding?.title || criticalFindingAlert?.description || t('review_critical_findings_and_unblock_the_team')}
                                    </p>
                                    {criticalFindingAlert?.details?.recommendation && (
                                        <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300 mt-2">{criticalFindingAlert.details.recommendation}</p>
                                    )}
                                </div>
                                <Badge variant="danger" className="text-[9px] px-1.5 py-0.5 font-black uppercase tracking-widest">
                                    {t('act_now')}
                                </Badge>
                            </div>
                        </div>
                    )}

                    {unresolvedFindings === 0 ? (
                        <div className="flex-grow flex flex-col items-center justify-center py-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-[hsl(var(--brand-success)/0.12)] dark:bg-[hsl(var(--brand-success)/0.1)] border border-[hsl(var(--brand-success)/0.2)] dark:border-[hsl(var(--brand-success)/0.2)] flex items-center justify-center mb-4 transition-all group-hover:scale-110">
                                <CheckCircle className="w-7 h-7 text-[hsl(var(--brand-success))] dark:text-[hsl(var(--brand-success))]" />
                            </div>
                            <p className="text-base font-black text-[hsl(var(--brand-success))] dark:text-[hsl(var(--brand-success))] mb-1">{t('clean_state')}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{resolvedFindings} resolved historically</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2 mb-5">
                                {findingsBySeverity.CRITICAL && findingsBySeverity.CRITICAL > 0 && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                                        <span className="text-sm font-black text-rose-700 dark:text-rose-400 w-6">{findingsBySeverity.CRITICAL}</span>
                                        <span className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-widest">{t('critical')}</span>
                                    </div>
                                )}
                                {findingsBySeverity.HIGH && findingsBySeverity.HIGH > 0 && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                                        <span className="text-sm font-black text-orange-700 dark:text-orange-400 w-6">{findingsBySeverity.HIGH}</span>
                                        <span className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-widest">{t('high')}</span>
                                    </div>
                                )}
                                {findingsBySeverity.MEDIUM && findingsBySeverity.MEDIUM > 0 && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--brand-warning))]" />
                                        <span className="text-sm font-black text-[hsl(var(--brand-warning))] dark:text-[hsl(var(--brand-warning))] w-6">{findingsBySeverity.MEDIUM}</span>
                                        <span className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-widest">{t('medium')}</span>
                                    </div>
                                )}
                                {findingsBySeverity.LOW && findingsBySeverity.LOW > 0 && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                        <span className="text-sm font-black text-blue-700 dark:text-blue-400 w-6">{findingsBySeverity.LOW}</span>
                                        <span className="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-widest">{t('low')}</span>
                                    </div>
                                )}
                            </div>

                            {mostCriticalFinding && (
                                <div className="mt-auto bg-slate-800/40 border border-slate-700/60 rounded-lg p-3">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('oldest_most_severe')}</p>
                                    <p className="text-xs font-semibold text-slate-300 truncate mb-2">{mostCriticalFinding.title}</p>
                                    <div className="flex justify-between items-center text-[9px] text-slate-500 font-medium">
                                        <span className="truncate max-w-[100px]">{t('assigned_colon', { name: mostCriticalFinding.assignedToName || mostCriticalFinding.assignedTo?.name || t('unassigned') })}</span>
                                        <span>{t('age_days', { days: mostCriticalFinding.createdAt ? Math.floor((Date.now() - new Date(mostCriticalFinding.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0 })}</span>
                                    </div>
                                </div>
                            )}

                            {canSee('findings') && (
                                <div className="mt-4 text-center">
                                    <span className="text-[10px] text-cyan-500/80 hover:text-cyan-400 font-bold uppercase tracking-wider group-hover:underline">{t('view_all_findings')} &rarr;</span>
                                </div>
                            )}
                        </>
                    )}
                </GlassCard>
                )}
            </div>
            )}

            {(showSection('team_capacity') || showSection('activity_feed')) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {showSection('team_capacity') && (
                    <GlassCard className={`p-6 border-t-4 border-t-indigo-500 dark:border-slate-800 relative transition-colors h-full ${canSee('team') ? 'hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer' : ''}`} onClick={() => canSee('team') && onNavigate?.('team')}>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-blue-500" /> {t('team_capacity')}
                                </h3>
                                {highLoadMembers.length > 0 && <Badge variant="danger" className="text-[9px] px-1.5 py-0.5 shadow-sm">{highLoadMembers.length} {t('high_load')}</Badge>}
                            </div>

                            {capacityMembers.length > 0 ? (
                            <>
                            <table className="w-full text-left border-collapse mb-1">
                                <thead>
                                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        <th className="pb-2 font-medium">{t('member')}</th>
                                        <th className="pb-2 font-medium text-center">{t('tasks_count')}</th>
                                        <th className="pb-2 font-medium text-right">{t('status_col')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {capacityMembers.map((member: any) => {
                                        const getStatusColor = (status: string) => {
                                            switch (status) {
                                                case 'high': return '#ef4444';
                                                case 'medium': return '#f59e0b';
                                                case 'low': return '#22c55e';
                                                case 'available': return '#94a3b8';
                                                default: return '#94a3b8';
                                            }
                                        };
                                        const getStatusLabel = (status: string) => {
                                            switch (status) {
                                                case 'high': return `🔴 ${t('high')}`;
                                                case 'medium': return `🟡 ${t('medium')}`;
                                                case 'low': return `🟢 ${t('low')}`;
                                                case 'available': return `⚪ ${t('available')}`;
                                                default: return `⚪ ${t('unknown')}`;
                                            }
                                        };
                                        const statusColor = getStatusColor(member.status);
                                        return (
                                            <tr key={member.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                                                <td className="py-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm border border-slate-700">
                                                            {member.name.charAt(0)}
                                                        </div>
                                                        <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[80px]">{member.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-2 text-center">
                                                    <span className="text-xs font-black" style={{ color: statusColor }}>
                                                        {member.taskCount}
                                                    </span>
                                                </td>
                                                <td className="py-2 text-right">
                                                    <span className="text-[10px] font-bold tracking-wider" style={{ color: statusColor }}>
                                        {getStatusLabel(member.status)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                                </tbody>
                            </table>

                            {availableMembers.length > 0 && (
                                <div className="mt-4 p-2 bg-[hsl(var(--brand-success)/0.1)] rounded border border-[hsl(var(--brand-success)/0.2)] text-center">
                                    <span className="text-[9px] text-[hsl(var(--brand-success))] font-bold uppercase tracking-wider">
                                        {availableMembers.length} {t('members_available')}
                                    </span>
                                </div>
                            )}

                            {canSee('team') && (
                                <div className="mt-4 text-center pt-1 border-t border-slate-800/50">
                                    <span className="text-[9px] text-cyan-500/80 font-bold uppercase tracking-wider">{t('view_team_details')} &rarr;</span>
                                </div>
                            )}
                            </>
                            ) : (
                                <div className="flex items-center justify-center min-h-[220px] text-center text-slate-500 text-sm font-medium">
                                    {t('no_team_capacity_data')}
                                </div>
                            )}
                        </GlassCard>
                )}

                {showSection('activity_feed') && <ActivityFeed activities={activity} />}
            </div>
            )}
        </div>
    );
};

