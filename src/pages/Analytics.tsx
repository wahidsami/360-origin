import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { GlassCard } from '../components/ui/UIComponents';
import { api } from '../services/api';
import toast from 'react-hot-toast';

const COLORS = ['#06b6d4', '#6366f1', '#f59e0b', '#ef4444', '#10b981'];

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

const Analytics: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.analytics.get();
        setData(res as AnalyticsData);
      } catch (e) {
        toast.error(t('failed_load_analytics'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="p-10 text-slate-500 text-center">{t('loading_analytics')}</div>;
  if (!data) return <div className="p-10 text-slate-500 text-center">{t('no_data')}</div>;

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-8 h-8 text-cyan-500" />
          {t('advanced_analytics')}
        </h1>
        <p className="text-slate-400 mt-1">{t('analytics_subtitle')}</p>
      </div>

      {/* Portfolio */}
      <GlassCard title={t('portfolio_analytics')} className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-cyan-500" />
        <div className="flex-1 grid md:grid-cols-2 gap-6">
          <div className="min-h-[200px]">
            <h3 className="text-slate-300 text-sm font-medium mb-2">{t('projects_by_health')}</h3>
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
              <BarChart data={data.portfolio.byHealth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="health" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="min-h-[200px]">
            <h3 className="text-slate-300 text-sm font-medium mb-2">{t('projects_by_status')}</h3>
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
              <BarChart data={data.portfolio.byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="status" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="text-slate-500 text-sm mt-2">{t('total_projects')}: {data.portfolio.projectCount}</p>
      </GlassCard>

      {/* Team */}
      <GlassCard title={t('team_analytics')} className="flex items-center gap-2">
        <Users className="w-5 h-5 text-cyan-500" />
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap gap-4 items-baseline">
            <p className="text-slate-400 text-sm">
              {t('tasks_completed_30d')} <span className="text-white font-medium">{data.team.tasksDoneLast30Days}</span>
            </p>
            {data.team.completionRate != null && (
              <p className="text-slate-400 text-sm">
                {t('completion_rate')} <span className="text-white font-medium">{data.team.completionRate}%</span>
                {data.team.totalTasks != null && (
                  <span className="text-slate-500 ml-1">({data.team.doneTasks ?? 0} / {data.team.totalTasks} {t('tasks')})</span>
                )}
              </p>
            )}
          </div>
          {data.team.velocityByWeek && data.team.velocityByWeek.length > 0 && (
            <div className="min-h-[200px]">
              <h3 className="text-slate-300 text-sm font-medium mb-2">{t('velocity_tasks_per_week')}</h3>
              <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                <BarChart data={data.team.velocityByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="weekLabel" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  <Bar dataKey="completed" fill="#06b6d4" radius={[4, 4, 0, 0]} name={t('completed')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <h3 className="text-slate-300 text-sm font-medium mb-2">{t('open_tasks_by_assignee')}</h3>
          <div className="min-h-[240px]">
          <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
            <BarChart data={data.team.byAssignee} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" stroke="#64748b" fontSize={12} />
              <YAxis type="category" dataKey="assigneeName" stroke="#64748b" fontSize={12} width={70} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
              <Bar dataKey="openTasks" fill="#06b6d4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </GlassCard>

      {/* Findings */}
      <GlassCard title={t('findings_analytics')} className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-cyan-500" />
        <div className="flex-1 grid md:grid-cols-2 gap-6">
          <div className="min-h-[200px]">
            <h3 className="text-slate-300 text-sm font-medium mb-2">{t('by_severity')}</h3>
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
              <BarChart data={data.findings.bySeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="severity" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="min-h-[200px]">
            <h3 className="text-slate-300 text-sm font-medium mb-2">{t('by_status')}</h3>
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
              <BarChart data={data.findings.byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="status" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="text-slate-500 text-sm mt-2">
          {t('closed_findings')}: {data.findings.totalClosed}
          {data.findings.mttrDays != null && ` · ${t('mttr')}: ${data.findings.mttrDays} ${t('days')}`}
        </p>
      </GlassCard>
    </div>
  );
};

export default Analytics;
