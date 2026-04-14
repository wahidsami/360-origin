import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard, Button, Modal } from '../ui/UIComponents';
import { api } from '../../services/api';
import { Repeat, Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { useAppDialog } from '../../contexts/DialogContext';

export type RecurringTaskTemplate = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  priority: string;
  recurrenceRule: { frequency: string; interval?: number; weekday?: number };
  nextRunAt: string;
  lastRunAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

interface RecurringTasksTabProps {
  projectId: string;
  onRefreshTasks?: () => void;
}

function formatRecurrence(
  rule: { frequency: string; interval?: number; weekday?: number },
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const freq = (rule.frequency || 'DAILY').toUpperCase();
  const interval = rule.interval ?? 1;
  const unitKey = freq === 'WEEKLY' ? 'week_unit' : freq === 'MONTHLY' ? 'month_unit' : 'day_unit';
  const label = t(freq === 'WEEKLY' ? 'weekly' : freq === 'MONTHLY' ? 'monthly' : 'daily');
  if (interval > 1) return t('every_n_frequency', { count: interval, unit: t(`${unitKey}_${interval === 1 ? 'singular' : 'plural'}`) });
  if (freq === 'WEEKLY' && rule.weekday != null) {
    const days = ['sun_short', 'mon_short', 'tue_short', 'wed_short', 'thu_short', 'fri_short', 'sat_short'];
    const dayKey = days[rule.weekday === 7 ? 0 : rule.weekday];
    return t('weekly_on_day', { day: t(dayKey) });
  }
  return label;
}

export const RecurringTasksTab: React.FC<RecurringTasksTabProps> = ({ projectId, onRefreshTasks }) => {
  const { t } = useTranslation();
  const { confirm } = useAppDialog();
  const [templates, setTemplates] = useState<RecurringTaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    frequency: 'WEEKLY',
    interval: 1,
    weekday: 1,
    nextRunAt: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.projects.getRecurringTasks(projectId);
      setTemplates(list || []);
    } catch (e) {
      console.error('Failed to load recurring tasks', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      description: '',
      priority: 'MEDIUM',
      frequency: 'WEEKLY',
      interval: 1,
      weekday: 1,
      nextRunAt: new Date().toISOString().slice(0, 16),
    });
    setShowForm(true);
  };

  const openEdit = (t: RecurringTaskTemplate) => {
    setEditingId(t.id);
    setForm({
      title: t.title,
      description: t.description || '',
      priority: t.priority,
      frequency: t.recurrenceRule.frequency,
      interval: t.recurrenceRule.interval || 1,
      weekday: t.recurrenceRule.weekday || 1,
      nextRunAt: t.nextRunAt.slice(0, 16),
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        recurrenceRule: {
          frequency: form.frequency,
          interval: form.interval,
          weekday: form.frequency === 'WEEKLY' ? form.weekday : undefined,
        },
        nextRunAt: form.nextRunAt || new Date().toISOString().slice(0, 16),
      };

      if (editingId) {
        await api.projects.updateRecurringTask(projectId, editingId, payload);
      } else {
        await api.projects.createRecurringTask(projectId, payload);
      }
      
      setShowForm(false);
      load();
      onRefreshTasks?.();
    } catch (e) {
      console.error('Save recurring task failed', e);
    }
  };

  const handleToggleActive = async (templateId: string, currentStatus: boolean) => {
    try {
      await api.projects.updateRecurringTask(projectId, templateId, { isActive: !currentStatus });
      load();
    } catch (e) {
      console.error('Toggle status failed', e);
    }
  };

  const handleDelete = async (templateId: string) => {
    const shouldDelete = await confirm({
      title: t('delete_template'),
      message: t('delete_recurring_task_template_confirm'),
      confirmText: t('delete'),
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.projects.deleteRecurringTask(projectId, templateId);
      load();
      onRefreshTasks?.();
    } catch (e) {
      console.error('Delete recurring task failed', e);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-8 text-center text-slate-400">
        {t('loading_recurring')}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <Repeat className="w-5 h-5" /> {t('recurring_tasks_title')}
        </h3>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> {t('add_template')}
        </Button>
      </div>

      <Modal 
        isOpen={showForm} 
        onClose={() => setShowForm(false)} 
        title={editingId ? t('edit_task_template') : t('add_recurring_task_template')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('task_title_label')}</label>
            <input
              type="text"
              placeholder={t('task_title_placeholder')}
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('desc_optional')}</label>
            <textarea
              placeholder={t('desc_placeholder')}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('priority_label')}</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="LOW">{t('low')}</option>
                <option value="MEDIUM">{t('medium')}</option>
                <option value="HIGH">{t('high')}</option>
                <option value="URGENT">{t('urgent')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('frequency_label')}</label>
              <select
                value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="DAILY">{t('daily')}</option>
                <option value="WEEKLY">{t('weekly')}</option>
                <option value="MONTHLY">{t('monthly')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {form.frequency === 'WEEKLY' ? (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('day_of_week')}</label>
                <select
                  value={form.weekday}
                  onChange={e => setForm(f => ({ ...f, weekday: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                >
                  {['sun_short', 'mon_short', 'tue_short', 'wed_short', 'thu_short', 'fri_short', 'sat_short'].map((d, i) => (
                    <option key={d} value={i === 0 ? 7 : i}>{t(d)}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('interval_label')}</label>
                <input
                  type="number"
                  min="1"
                  value={form.interval}
                  onChange={e => setForm(f => ({ ...f, interval: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t('next_run_time')}</label>
              <input
                type="datetime-local"
                value={form.nextRunAt}
                onChange={e => setForm(f => ({ ...f, nextRunAt: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="primary" className="flex-1" onClick={handleSubmit}>
              {editingId ? t('save_changes_btn') : t('create_template_btn')}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>{t('cancel_btn')}</Button>
          </div>
        </div>
      </Modal>

      {templates.length === 0 && !showForm && (
        <GlassCard className="p-8 text-center text-slate-500">
          {t('no_recurring_templates')}
        </GlassCard>
      )}

      <ul className="space-y-2">
        {templates.map((template) => (
          <li key={template.id}>
            <GlassCard className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-200">{template.title}</span>
                  <span className="text-xs text-slate-500 uppercase">{t(template.priority.toLowerCase())}</span>
                  {!template.isActive && <span className="text-xs text-[hsl(var(--brand-warning))]">{t('pause')}</span>}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatRecurrence(template.recurrenceRule, t)}
                  {' · '}
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {t('next_run_time')}: {new Date(template.nextRunAt).toLocaleString()}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleActive(template.id, template.isActive)}
                  title={template.isActive ? t('pause') : t('resume')}
                  className="text-xs h-8 px-3"
                >
                  {template.isActive ? t('pause') : t('resume')}
                </Button>
                <div className="w-px h-6 bg-slate-800 mx-1" />
                <button 
                  onClick={() => openEdit(template)}
                  className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
                  title={t('edit_template')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(template.id)}
                  className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                  title={t('delete_template')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </GlassCard>
          </li>
        ))}
      </ul>
    </div>
  );
};
