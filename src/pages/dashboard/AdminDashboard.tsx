import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, CheckCircle2, Activity, ShieldAlert, Settings2, AlertTriangle, FileText, Briefcase, ArrowRight, ShieldCheck } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { GlassCard, Badge, Button, Modal } from '@/components/ui/UIComponents';
import { ToolsPanel } from '@/components/ToolsPanel';
import { api } from '@/services/api';
import { Role, Project, ProjectUpdate } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/currency';
import toast from 'react-hot-toast';

const DEFAULT_WIDGET_IDS = ['kpi-cards', 'client-compliance', 'latest-updates', 'projects-at-risk', 'pending-approvals', 'tools-panel'] as const;
const WIDGET_LABELS: Record<string, string> = {
  'kpi-cards': 'widget_kpi_cards',
  'tools-panel': 'widget_quick_actions',
  'client-compliance': 'widget_client_compliance_chart',
  'latest-updates': 'widget_latest_updates',
  'projects-at-risk': 'widget_projects_at_risk',
};

type AnalyticsData = {
  portfolio: {
    byHealth: { health: string; count: number }[];
    byStatus: { status: string; count: number }[];
    totalBudget: number;
    projectCount: number;
  };
  team: {
    byAssignee: { assigneeId: string | null; assigneeName: string; openTasks: number }[];
    tasksDoneLast30Days: number;
    velocityByWeek?: { weekLabel: string; completed: number }[];
    completionRate?: number;
    totalTasks?: number;
    doneTasks?: number;
  };
  financial: {
    revenueByMonth: { month: string; amount: number }[];
    arAging: { '0-30': number; '31-60': number; '61-90': number; '90+': number };
    totalOutstanding: number;
  };
  findings: {
    bySeverity: { severity: string; count: number }[];
    byStatus: { status: string; count: number }[];
    mttrDays: number | null;
    totalClosed: number;
  };
};

const severityColors: Record<string, string> = {
  CRITICAL: '#f43f5e',
  HIGH: '#fb7185',
  MEDIUM: 'hsl(var(--brand-warning))',
  LOW: 'hsl(var(--brand-success))',
};

const healthColors: Record<string, string> = {
  HEALTHY: 'hsl(var(--brand-success))',
  AT_RISK: 'hsl(var(--brand-warning))',
  CRITICAL: '#f43f5e',
  ON_HOLD: '#64748b',
};

const statusColors = ['hsl(var(--brand-info))', '#3b82f6', '#8b5cf6', 'hsl(var(--brand-success))', 'hsl(var(--brand-warning))', '#f43f5e'];

const prettifyLabel = (value: string) =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const MiniSparkline: React.FC<{ values: number[]; stroke: string; fill: string }> = ({ values, stroke, fill }) => {
  const data = values.map((value, index) => ({ index, value }));

  if (data.length === 0) {
    return <div className="h-14 w-24" />;
  }

  return (
    <div className="h-14 w-24">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={fill} fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const AdminDashboard: React.FC<{ role: Role }> = ({ role }) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgetOrder, setWidgetOrder] = useState<string[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeWidgets, setCustomizeWidgets] = useState<{ id: string; enabled: boolean }[]>([]);

  const mergeWidgetOrder = React.useCallback((saved: string[]) => {
    const filteredSaved = saved.filter((id) => DEFAULT_WIDGET_IDS.includes(id as (typeof DEFAULT_WIDGET_IDS)[number]));
    const merged = [...filteredSaved];
    for (const id of DEFAULT_WIDGET_IDS) {
      if (!merged.includes(id)) {
        merged.push(id);
      }
    }
    return merged;
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [dashboardData, analyticsData, prefs] = await Promise.all([
          api.dashboard.getAdminStats(),
          api.analytics.get().catch(() => null),
          api.me.getDashboardPreferences().catch(() => ({ widgets: [] })),
        ]);

        setStats(dashboardData);
        setAnalytics((analyticsData as AnalyticsData | null) || null);

        if (prefs.widgets?.length) {
          setWidgetOrder(mergeWidgetOrder(prefs.widgets.map((w: any) => w.id)));
        } else {
          setWidgetOrder([...DEFAULT_WIDGET_IDS]);
        }
      } catch (error) {
        toast.error(t('failed_load_analytics'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [mergeWidgetOrder, t]);

  const complianceSeries = useMemo(
    () =>
      (stats?.clientComplianceComparison || [])
        .map((item: { clientId: string; clientName: string; compliancePercentage: number; needsAttentionChecks: number; scoredChecks: number; audited?: boolean }, index: number) => ({
          ...item,
          rank: index + 1,
          shortName: `${index + 1}. ${item.clientName.length > 16 ? `${item.clientName.slice(0, 16)}...` : item.clientName}`,
        })),
    [stats?.clientComplianceComparison],
  );

  const topPerformer = complianceSeries[0] || null;
  const lowestPerformer = complianceSeries.length > 0 ? complianceSeries[complianceSeries.length - 1] : null;
  const complianceChartHeight = Math.max(220, complianceSeries.length * 52);
  const useCompactComplianceLayout = complianceSeries.length <= 4;

  const findingsSeverityData = useMemo(
    () =>
      (analytics?.findings.bySeverity || [])
        .filter((item) => item.count > 0)
        .map((item) => ({
          ...item,
          name: prettifyLabel(item.severity),
          fill: severityColors[item.severity] || '#06b6d4',
        })),
    [analytics?.findings.bySeverity],
  );

  const findingsStatusData = useMemo(
    () =>
      (analytics?.findings.byStatus || [])
        .filter((item) => item.count > 0)
        .map((item, index) => ({
          ...item,
          name: prettifyLabel(item.status),
          fill: statusColors[index % statusColors.length],
        })),
    [analytics?.findings.byStatus],
  );

  const portfolioHealthData = useMemo(
    () =>
      (analytics?.portfolio.byHealth || [])
        .filter((item) => item.count > 0)
        .map((item) => ({
          ...item,
          name: prettifyLabel(item.health),
          fill: healthColors[item.health] || '#06b6d4',
        })),
    [analytics?.portfolio.byHealth],
  );

  const coveragePercentage = useMemo(() => {
    const total = stats?.totalClients ?? 0;
    const audited = stats?.auditedClients ?? 0;
    return total > 0 ? Math.round((audited / total) * 100) : 0;
  }, [stats?.totalClients, stats?.auditedClients]);

  const coverageData = useMemo(() => {
    const total = stats?.totalClients ?? 0;
    const audited = stats?.auditedClients ?? 0;
    const remaining = Math.max(total - audited, 0);
    return [
      { name: t('audited_clients'), value: audited, fill: '#06b6d4' },
      { name: t('remaining_clients'), value: remaining, fill: '#1e293b' },
    ].filter((item) => item.value > 0);
  }, [stats?.auditedClients, stats?.totalClients, t]);

  const coverageSpark = useMemo(
    () => [stats?.auditedClients ?? 0, Math.max((stats?.totalClients ?? 0) - (stats?.auditedClients ?? 0), 0), stats?.totalClients ?? 0],
    [stats?.auditedClients, stats?.totalClients],
  );

  const complianceSpark = useMemo(
    () => complianceSeries.map((item) => item.compliancePercentage),
    [complianceSeries],
  );

  const reviewedSpark = useMemo(
    () => findingsStatusData.map((item) => item.count),
    [findingsStatusData],
  );

  const attentionSpark = useMemo(
    () => complianceSeries.map((item) => item.needsAttentionChecks),
    [complianceSeries],
  );
  const showFindingsStatusChart = findingsStatusData.length > 1;
  const showPortfolioHealthChart = portfolioHealthData.length > 1;

  const chartAxisColor = '#94a3b8';
  const chartGridColor = 'rgba(148, 163, 184, 0.12)';
  const tooltipStyle = {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: '16px',
    boxShadow: '0 20px 50px rgba(2, 6, 23, 0.45)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    padding: '12px',
  } as const;

  const openCustomize = () => {
    setCustomizeWidgets(DEFAULT_WIDGET_IDS.map((id) => ({ id, enabled: widgetOrder.includes(id) })));
    setCustomizeOpen(true);
  };

  const saveCustomize = async () => {
    const enabled = customizeWidgets.filter((widget) => widget.enabled).map((widget) => widget.id);
    const widgets = enabled.map((id, index) => ({ id, order: index, config: {} }));
    await api.me.updateDashboardPreferences({ widgets });
    setWidgetOrder(enabled);
    setCustomizeOpen(false);
    toast.success(t('dashboard_updated'));
  };

  const openClient = (clientId?: string | null) => {
    if (!clientId) return;
    navigate(`/app/clients/${clientId}`);
  };

  const openReportWorkspace = (item: { projectId?: string | null; reportId?: string | null; clientId?: string | null }) => {
    if (item.projectId && item.reportId) {
      navigate(`/app/projects/${item.projectId}/report-builder/${item.reportId}`);
      return;
    }
    if (item.clientId) {
      openClient(item.clientId);
    }
  };

  const scrollToLatestUpdates = () => {
    document.getElementById('dashboard-latest-updates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (location.hash !== '#pending-approvals') return;
    const timer = window.setTimeout(() => {
      document.getElementById('dashboard-pending-approvals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location.hash, stats?.pendingApprovals]);

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">{t('initializing')}</div>;
  }

  if (!stats) {
    return <div className="p-10 text-center text-slate-500">{t('no_data')}</div>;
  }

  const visible = widgetOrder.length ? widgetOrder : [...DEFAULT_WIDGET_IDS];
  const has = (id: string) => visible.includes(id);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-4xl font-black font-display text-slate-900 dark:text-white uppercase tracking-tighter">{t('dashboard')}</h1>
          <p className="mt-2 max-w-3xl text-slate-500 dark:text-slate-400 font-medium">
            {t('welcome')}, {role.replace('_', ' ')}. {stats.auditedClients ?? 0} / {stats.totalClients ?? 0} {t('clients_audited_short')}.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={openCustomize} className="text-slate-500 hover:text-cyan-600 font-bold uppercase tracking-widest text-[10px] self-start">
          <Settings2 className="w-4 h-4 mr-2" /> {t('customize_workspace')}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] gap-5">
        <div className="relative overflow-hidden rounded-[28px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.28),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.86)_50%,rgba(30,41,59,0.96))] p-6 shadow-[0_22px_60px_rgba(2,6,23,0.26)]">
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
            <div>
              <Badge variant="info" size="sm" className="border-cyan-400/20 bg-cyan-500/10 text-cyan-200">{t('dashboard')}</Badge>
              <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight tracking-tight text-white">
                {t('executive_accessibility_overview')}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                {t('dashboard_hero_caption')}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button size="sm" onClick={() => navigate('/app/reports')} className="shadow-none">
                  <FileText className="mr-2 h-4 w-4" /> {t('view_reports')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/app/clients')} className="border-slate-600 bg-slate-900/40 text-slate-100 hover:bg-slate-800/70">
                  <Briefcase className="mr-2 h-4 w-4" /> {t('view_clients')}
                </Button>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/90">{t('top_client')}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-white">{topPerformer?.clientName || t('no_data')}</p>
                    <p className="mt-1 text-xs text-slate-300">{topPerformer ? `${topPerformer.compliancePercentage}% ${t('client_compliance_score').toLowerCase()}` : t('no_client_compliance_data')}</p>
                  </div>
                  {topPerformer && (
                    <button
                      type="button"
                      onClick={() => openReportWorkspace(topPerformer)}
                      className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-2.5 text-cyan-200 transition-all hover:border-cyan-300/40 hover:bg-cyan-500/20"
                      title={t('open_report')}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">{t('active_clients')}</p>
                  <p className="mt-3 text-3xl font-black text-white">{stats.totalClients ?? 0}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">{t('reviewed_checks')}</p>
                  <p className="mt-3 text-3xl font-black text-white">{stats.scoredChecks ?? 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[28px] border border-[hsl(var(--brand-success)/0.18)] bg-gradient-to-br from-[hsl(var(--brand-success)/0.18)] via-slate-900 to-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-success">{t('operational_pulse')}</p>
                <p className="mt-2 text-2xl font-black text-white">{stats.projectsAtRisk?.length ?? 0}</p>
                <p className="mt-1 text-xs text-slate-300">{t('projects_at_risk')}</p>
              </div>
              <div className="rounded-2xl status-success p-3">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-slate-950/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{t('pending_approvals')}</p>
                <p className="mt-2 text-xl font-black text-white">{stats.pendingApprovals ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-slate-950/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{t('latest_updates')}</p>
                <p className="mt-2 text-xl font-black text-white">{stats.latestUpdates?.length ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-violet-500/18 bg-gradient-to-br from-violet-500/18 via-slate-900 to-slate-900 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">{t('report_activity')}</p>
            <div className="mt-4 space-y-3">
              {complianceSeries.slice(0, 3).map((item) => (
                <button
                  key={item.clientId}
                  type="button"
                  onClick={() => openReportWorkspace(item)}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-slate-950/30 px-4 py-3 text-left transition-all hover:border-violet-300/30 hover:bg-slate-900/60"
                >
                  <div>
                    <p className="text-sm font-black text-white">{item.clientName}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.scoredChecks} {t('reviewed_checks').toLowerCase()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-violet-200">{item.compliancePercentage}%</p>
                    <p className="text-[11px] text-slate-400">{t('open_report')}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {has('kpi-cards') && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="group relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/16 via-slate-900 to-slate-900 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-cyan-500/10">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-400/12 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/90">{t('audit_coverage')}</p>
                <p className="mt-2 text-3xl font-black text-white">{coveragePercentage}%</p>
                <p className="mt-1 text-xs text-slate-300">{stats.auditedClients ?? 0} / {stats.totalClients ?? 0} {t('clients_audited_short')}</p>
              </div>
              <div className="rounded-2xl bg-cyan-500/12 p-3 text-cyan-300">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/90">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${coveragePercentage}%` }} />
              </div>
              <MiniSparkline values={coverageSpark} stroke="#22d3ee" fill="#22d3ee" />
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/16 via-slate-900 to-slate-900 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-violet-500/10">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-400/12 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200/90">{t('average_compliance')}</p>
                <p className="mt-2 text-3xl font-black text-white">{stats.averageCompliance ?? 0}%</p>
                <p className="mt-1 text-xs text-slate-300">{t('across_audited_clients')}</p>
              </div>
              <div className="rounded-2xl bg-violet-500/12 p-3 text-violet-300">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <Badge variant="neutral" size="sm" className="border-violet-400/20 bg-violet-500/8 text-violet-200">{stats.auditedClients ?? 0} {t('audited_clients').toLowerCase()}</Badge>
              <MiniSparkline values={complianceSpark} stroke="#8b5cf6" fill="#8b5cf6" />
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-[hsl(var(--brand-success)/0.2)] bg-gradient-to-br from-[hsl(var(--brand-success)/0.16)] via-slate-900 to-slate-900 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_hsl(var(--brand-success)/0.18)]">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[hsl(var(--brand-success)/0.12)] blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-success">{t('reviewed_checks')}</p>
                <p className="mt-2 text-3xl font-black text-white">{stats.scoredChecks ?? 0}</p>
                <p className="mt-1 text-xs text-slate-300">{t('pass_fail_partial_checks')}</p>
              </div>
              <div className="rounded-2xl status-success p-3">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <Badge variant="neutral" size="sm" className="status-success border border-[hsl(var(--brand-success)/0.2)]">{stats.scoredChecks ?? 0} {t('total_label')}</Badge>
              <MiniSparkline values={reviewedSpark} stroke="#22c55e" fill="#22c55e" />
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-[hsl(var(--brand-warning)/0.2)] bg-gradient-to-br from-[hsl(var(--brand-warning)/0.16)] via-slate-900 to-slate-900 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_hsl(var(--brand-warning)/0.18)]">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[hsl(var(--brand-warning)/0.12)] blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-warning">{t('checks_needing_attention')}</p>
                <p className="mt-2 text-3xl font-black text-white">{stats.needsAttentionChecks ?? 0}</p>
                <p className="mt-1 text-xs text-slate-300">{t('failed_and_partial_checks')}</p>
              </div>
              <div className="rounded-2xl status-warning p-3">
                <ShieldAlert className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <Badge variant="neutral" size="sm" className="status-warning border border-[hsl(var(--brand-warning)/0.2)]">{stats.needsAttentionChecks ?? 0} {t('flagged_label')}</Badge>
              <MiniSparkline values={attentionSpark} stroke="#f59e0b" fill="#f59e0b" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {has('client-compliance') && (
          <GlassCard className={`xl:col-span-9 overflow-hidden ${useCompactComplianceLayout ? 'self-start' : ''}`} title={t('client_compliance_comparison')}>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant="info" size="sm">{t('average_compliance')}: {stats.averageCompliance ?? 0}%</Badge>
              <Badge variant="neutral" size="sm">{t('audited_clients')}: {stats.auditedClients ?? 0}</Badge>
              <Badge variant="neutral" size="sm">{t('reviewed_checks')}: {stats.scoredChecks ?? 0}</Badge>
              <Badge variant="warning" size="sm">{t('checks_needing_attention')}: {stats.needsAttentionChecks ?? 0}</Badge>
            </div>
            {complianceSeries.length > 0 ? (
              <div className={`grid gap-5 ${useCompactComplianceLayout ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_240px]'}`}>
                <div className="rounded-3xl border border-slate-200/40 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_45%)] p-3 dark:border-slate-800/70 dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_48%)]">
                  {useCompactComplianceLayout ? (
                    <div className="grid gap-3">
                      {complianceSeries.map((item) => (
                        <button
                          key={item.clientId}
                          type="button"
                          onClick={() => openReportWorkspace(item)}
                          className="grid gap-4 rounded-3xl border border-slate-700/60 bg-slate-950/25 p-4 text-left transition-all hover:border-cyan-300/20 hover:bg-slate-900/60 md:grid-cols-[minmax(0,1fr)_220px]"
                        >
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">#{item.rank}</p>
                            <p className="mt-2 text-xl font-black text-white">{item.clientName}</p>
                            <p className="mt-1 text-sm text-slate-300">
                              {item.audited ? `${item.scoredChecks} ${t('reviewed_checks').toLowerCase()}` : t('not_audited_yet')}
                            </p>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-300">{t('client_compliance_score')}</span>
                              <span className="font-black text-cyan-300">{item.compliancePercentage}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500"
                                style={{ width: `${Math.max(item.compliancePercentage, 4)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-400">{t('checks_needing_attention')}</span>
                              <span className="font-black text-brand-warning">{item.audited ? item.needsAttentionChecks : '--'}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="max-h-[560px] overflow-y-auto pr-2">
                      <div dir="ltr" className="w-full min-h-[220px]" style={{ height: complianceChartHeight }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart
                            data={complianceSeries}
                            layout="vertical"
                            margin={{ top: 8, right: isRtl ? 176 : 16, left: isRtl ? 12 : 4, bottom: 8 }}
                            barCategoryGap="26%"
                          >
                            <defs>
                              <linearGradient id="complianceHigh" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#22d3ee" />
                                <stop offset="100%" stopColor="#3b82f6" />
                              </linearGradient>
                              <linearGradient id="complianceMedium" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#fbbf24" />
                                <stop offset="100%" stopColor="#f59e0b" />
                              </linearGradient>
                              <linearGradient id="complianceLow" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#fb7185" />
                                <stop offset="100%" stopColor="#f43f5e" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} opacity={0.35} />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              reversed={isRtl}
                              stroke={chartAxisColor}
                              tick={{ fill: chartAxisColor }}
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => `${value}%`}
                            />
                            <YAxis
                              type="category"
                              dataKey="shortName"
                              stroke={chartAxisColor}
                              tick={{ fill: chartAxisColor, textAnchor: isRtl ? 'start' : 'end' }}
                              fontSize={12}
                              tickLine={false}
                              axisLine={false}
                              orientation={isRtl ? 'right' : 'left'}
                              mirror={false}
                              tickMargin={isRtl ? 14 : 8}
                              width={isRtl ? 168 : 156}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(34, 211, 238, 0.08)' }}
                              contentStyle={tooltipStyle}
                              formatter={(value: number, _name, context: any) => [
                                context?.payload?.audited
                                  ? `${value}% | ${context?.payload?.scoredChecks ?? 0} ${t('reviewed_checks').toLowerCase()}`
                                  : t('not_audited_yet'),
                                t('client_compliance_score'),
                              ]}
                              labelFormatter={(_label, payload: any) => payload?.[0]?.payload?.clientName || ''}
                            />
                            <Bar
                              dataKey="compliancePercentage"
                              radius={isRtl ? [14, 0, 0, 14] : [0, 14, 14, 0]}
                              maxBarSize={24}
                              onClick={(entry: any) => openReportWorkspace(entry)}
                              cursor="pointer"
                            >
                              {complianceSeries.map((entry) => (
                                <Cell
                                  key={entry.clientId}
                                  fill={entry.compliancePercentage >= 85 ? 'url(#complianceHigh)' : entry.compliancePercentage >= 60 ? 'url(#complianceMedium)' : 'url(#complianceLow)'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
                <div className={`grid gap-4 content-start ${useCompactComplianceLayout ? 'md:grid-cols-3 xl:grid-cols-3' : ''}`}>
                  <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">{t('average_compliance')}</p>
                    <p className="mt-3 text-4xl font-black text-white">{stats.averageCompliance ?? 0}%</p>
                    <p className="mt-2 text-xs text-slate-300">{stats.auditedClients ?? 0} {t('audited_clients').toLowerCase()}</p>
                  </div>
                  {topPerformer && (
                    <div className="rounded-3xl border border-[hsl(var(--brand-success)/0.2)] bg-[hsl(var(--brand-success)/0.1)] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-success">{t('top_client')}</p>
                      <p className="mt-2 text-lg font-black text-white">{topPerformer.clientName}</p>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-slate-300">{t('client_compliance_score')}</span>
                        <span className="font-black text-brand-success">{topPerformer.audited ? `${topPerformer.compliancePercentage}%` : t('not_audited_short')}</span>
                      </div>
                    </div>
                  )}
                  {lowestPerformer && (
                    <div className="rounded-3xl border border-[hsl(var(--brand-warning)/0.2)] bg-[hsl(var(--brand-warning)/0.1)] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-warning">{t('needs_focus')}</p>
                      <p className="mt-2 text-lg font-black text-white">{lowestPerformer.clientName}</p>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-slate-300">{t('checks_needing_attention')}</span>
                        <span className="font-black text-brand-warning">{lowestPerformer.audited ? lowestPerformer.needsAttentionChecks : t('not_audited_short')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="py-16 text-center text-sm font-medium italic text-slate-500 dark:text-slate-400">{t('no_client_compliance_data')}</p>
            )}
          </GlassCard>
        )}

        <div className="xl:col-span-3 grid gap-6">
          <GlassCard className="overflow-hidden cursor-pointer" title={t('audit_coverage')} onClick={() => navigate('/app/clients')}>
            <div className="grid gap-5 md:grid-cols-[112px,1fr] md:items-center">
              <div className="relative h-28 w-28 mx-auto">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <RadialBarChart
                    innerRadius="72%"
                    outerRadius="100%"
                    barSize={12}
                    data={[{ name: t('audit_coverage'), value: coveragePercentage, fill: '#22d3ee' }]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar background dataKey="value" cornerRadius={999} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black leading-none text-slate-900 dark:text-white">{coveragePercentage}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{t('audited_clients')}</p>
                  <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.auditedClients ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{t('remaining_clients')}</p>
                  <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{Math.max((stats.totalClients ?? 0) - (stats.auditedClients ?? 0), 0)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-500" style={{ width: `${coveragePercentage}%` }} />
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {stats.auditedClients ?? 0} / {stats.totalClients ?? 0} {t('clients_audited_short')}
            </p>
          </GlassCard>

          <GlassCard className="overflow-hidden cursor-pointer" title={t('findings_severity_mix')} onClick={() => navigate('/app/findings')}>
            {findingsSeverityData.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-[132px,1fr] md:items-center">
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie data={findingsSeverityData} dataKey="count" nameKey="name" innerRadius={34} outerRadius={56} stroke="none" paddingAngle={3}>
                        {findingsSeverityData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {findingsSeverityData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between rounded-2xl border border-slate-200/60 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-950/30 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.name}</span>
                      </div>
                      <span className="text-sm font-black text-slate-900 dark:text-white">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm font-medium italic text-slate-500 dark:text-slate-400">{t('no_data')}</p>
            )}
          </GlassCard>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 items-stretch gap-6">
        <GlassCard className="xl:col-span-4 h-full overflow-hidden cursor-pointer" title={t('findings_status_overview')} onClick={() => navigate('/app/findings')}>
          {findingsStatusData.length > 0 ? (
            showFindingsStatusChart ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={findingsStatusData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} opacity={0.2} />
                    <XAxis dataKey="name" stroke={chartAxisColor} tick={{ fill: chartAxisColor }} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={chartAxisColor} tick={{ fill: chartAxisColor }} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value, t('findings')]} />
                    <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                      {findingsStatusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-3">
                {findingsStatusData.map((entry) => (
                  <div key={entry.name} className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-4 dark:border-slate-800/70 dark:bg-slate-950/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.fill }} />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.name}</span>
                      </div>
                      <span className="text-xl font-black text-white">{entry.count}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(entry.count * 18, 100)}%`, backgroundColor: entry.fill }} />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="py-12 text-center text-sm font-medium italic text-slate-500 dark:text-slate-400">{t('no_data')}</p>
          )}
        </GlassCard>

        <GlassCard className="xl:col-span-4 h-full overflow-hidden cursor-pointer" title={t('portfolio_health_snapshot')} onClick={() => navigate('/app/projects')}>
          {portfolioHealthData.length > 0 ? (
            showPortfolioHealthChart ? (
              <div dir="ltr" className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={portfolioHealthData} layout="vertical" margin={{ top: 8, right: isRtl ? 132 : 16, left: isRtl ? 12 : 12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} opacity={0.2} />
                    <XAxis type="number" reversed={isRtl} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={chartAxisColor}
                      tick={{ fill: chartAxisColor, textAnchor: isRtl ? 'start' : 'end' }}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      orientation={isRtl ? 'right' : 'left'}
                      tickMargin={isRtl ? 12 : 8}
                      width={isRtl ? 120 : 96}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value, t('projects')]} />
                    <Bar dataKey="count" radius={isRtl ? [10, 0, 0, 10] : [0, 10, 10, 0]} maxBarSize={26}>
                      {portfolioHealthData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-3">
                {portfolioHealthData.map((entry) => (
                  <div key={entry.name} className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-4 dark:border-slate-800/70 dark:bg-slate-950/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.name}</span>
                      <span className="text-xl font-black text-white">{entry.count}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(entry.count * 22, 100)}%`, backgroundColor: entry.fill }} />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="py-12 text-center text-sm font-medium italic text-slate-500 dark:text-slate-400">{t('no_data')}</p>
          )}
        </GlassCard>

      </div>

      {has('tools-panel') && <ToolsPanel role={role} />}

      <div className="grid grid-cols-1 xl:grid-cols-12 items-stretch gap-6">
        {has('latest-updates') && (
          <GlassCard id="dashboard-latest-updates" className="xl:col-span-5 h-full overflow-hidden" title={t('latest_updates')}>
            <div className="space-y-5">
              {(stats.latestUpdates as ProjectUpdate[]).length > 0 ? (
                (stats.latestUpdates as ProjectUpdate[]).map((update) => (
                  <div key={update.id} className="flex gap-4 items-start rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:bg-white dark:border-slate-800/50 dark:bg-slate-950/20 dark:hover:bg-slate-900/50">
                    <div className="mt-1 rounded-2xl bg-slate-100 dark:bg-slate-800/50 p-2.5 text-cyan-600 dark:text-cyan-400">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{update.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{update.content}</p>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {new Date(update.timestamp).toLocaleDateString()} | {update.authorName}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm font-medium italic text-slate-500 dark:text-slate-400">{t('no_data')}</p>
              )}
            </div>
          </GlassCard>
        )}

        {has('projects-at-risk') && (
          <GlassCard className="xl:col-span-4 h-full overflow-hidden" title={t('projects_at_risk')}>
            <div className="space-y-4">
              {(stats.projectsAtRisk as Project[]).length > 0 ? (
                (stats.projectsAtRisk as Project[]).map((project) => (
                  <div
                    key={project.id}
                    className="cursor-pointer rounded-2xl border border-rose-100 bg-rose-50/50 p-5 transition-all hover:bg-rose-50 dark:border-rose-500/20 dark:bg-rose-900/10 dark:hover:bg-rose-900/20"
                    onClick={() => navigate(`/app/projects/${project.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-tight text-rose-900 dark:text-rose-200">{project.name}</p>
                        {'clientName' in project && project.clientName ? (
                          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">{String(project.clientName)}</p>
                        ) : null}
                      </div>
                      <Badge variant="danger" size="sm" pulse>{project.health}</Badge>
                    </div>
                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600" style={{ width: `${project.progress}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-[hsl(var(--brand-success)/0.2)] bg-[hsl(var(--brand-success)/0.08)] p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl status-success p-3">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-white">{t('system_stable')}</p>
                      <p className="mt-2 text-xs leading-6 text-slate-300">
                        {(analytics?.portfolio.projectCount ?? 0)} {t('projects').toLowerCase()} monitored.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate('/app/projects')}
                        className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-success"
                      >
                        {t('view_all_projects')} <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {has('pending-approvals') && (
          <GlassCard id="dashboard-pending-approvals" className="xl:col-span-3 overflow-hidden self-start" title={t('pending_approvals')}>
            <div className="space-y-4 rounded-3xl border border-slate-200/60 bg-slate-50/60 p-5 dark:border-slate-800/60 dark:bg-slate-950/25">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{t('awaiting_verification')}</p>
                  <div className="mt-3 text-4xl font-black tracking-tighter text-slate-900 dark:text-white">{stats.pendingApprovals}</div>
                </div>
                <div className="rounded-2xl bg-cyan-500/12 p-3 text-cyan-300">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
              <button
                type="button"
                onClick={scrollToLatestUpdates}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200/60 bg-white/50 px-4 py-3 text-left transition-all hover:bg-slate-100/80 dark:border-slate-800/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/80"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{t('latest_updates')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{stats.latestUpdates?.length ?? 0} {t('latest_updates').toLowerCase()}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </GlassCard>
        )}
      </div>

      <Modal isOpen={customizeOpen} onClose={() => setCustomizeOpen(false)} title={t('dashboard_preferences')}>
        <div className="space-y-6">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">{t('workspace_visibility_controls')}</p>
          <div className="grid gap-3">
            {customizeWidgets.map((widget, index) => (
              <label key={widget.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 cursor-pointer hover:bg-white dark:hover:bg-slate-800 transition-all">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{t(WIDGET_LABELS[widget.id] || widget.id)}</span>
                <input
                  type="checkbox"
                  checked={widget.enabled}
                  onChange={(event) => setCustomizeWidgets((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))}
                  className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setCustomizeOpen(false)} className="font-bold uppercase tracking-widest text-xs">{t('discard_changes')}</Button>
            <Button onClick={saveCustomize} className="font-black uppercase tracking-widest text-xs">{t('finalize_layout')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
