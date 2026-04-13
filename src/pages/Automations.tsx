import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Workflow, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { GlassCard, Button, Input, Label, Modal } from '../components/ui/UIComponents';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../contexts/DialogContext';
import { PermissionGate } from '../components/PermissionGate';
import { Permission } from '../types';
import toast from 'react-hot-toast';

const TRIGGER_ENTITIES = [
  { value: 'TASK', label: 'Task' },
  { value: 'FINDING', label: 'Finding' },
  { value: 'INVOICE', label: 'Invoice' },
] as const;

const TRIGGER_EVENTS = [
  { value: 'CREATED', label: 'Created' },
  { value: 'UPDATED', label: 'Updated' },
  { value: 'STATUS_CHANGED', label: 'Status changed' },
  { value: 'ASSIGNED', label: 'Assigned' },
] as const;

const ACTION_KINDS = [
  { value: 'CREATE_NOTIFICATION', label: 'Create notification' },
  { value: 'SEND_EMAIL', label: 'Send email' },
  { value: 'DISPATCH_WEBHOOK', label: 'Dispatch webhook' },
  { value: 'UPDATE_STATUS', label: 'Update status' },
  { value: 'ASSIGN_USER', label: 'Assign user' },
] as const;

const getDefaultUserIdField = (entity: string) => {
  if (entity === 'FINDING') return 'assignedToId';
  if (entity === 'INVOICE') return 'requestedById';
  return 'assigneeId';
};

const getDefaultLinkTemplate = (entity: string) => {
  if (entity === 'FINDING') return '/app/projects/{{projectId}}?tab=findings';
  if (entity === 'INVOICE') return '/app/projects/{{projectId}}?tab=financials';
  return '/app/projects/{{projectId}}?tab=tasks';
};

const getDefaultActionKind = (entity: string) => {
  if (entity === 'INVOICE') return 'SEND_EMAIL';
  return 'CREATE_NOTIFICATION';
};

export interface AutomationRuleType {
  id: string;
  name: string;
  triggerEntity: string;
  triggerEvent: string;
  triggerConditions: Record<string, any> | null;
  actionType: string;
  actionConfig: Record<string, any>;
  isActive: boolean;
  _count?: { logs: number };
}

const Automations: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { confirm } = useAppDialog();
  const [rules, setRules] = useState<AutomationRuleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRuleType | null>(null);
  const [form, setForm] = useState({
    name: '',
    triggerEntity: 'TASK',
    triggerEvent: 'ASSIGNED',
    actionKind: getDefaultActionKind('TASK'),
    titleTemplate: '{{title}}',
    bodyTemplate: '',
    userIdField: getDefaultUserIdField('TASK'),
    linkUrlTemplate: getDefaultLinkTemplate('TASK'),
    recipientEmail: '',
    webhookUrl: '',
    webhookSecret: '',
    eventName: '',
    targetStatus: '',
    isActive: true,
    conditions: [] as { field: string; value: string }[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.automation.listRules();
      setRules(list as AutomationRuleType[]);
    } catch (e) {
      console.error('Failed to load automation rules', e);
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      name: '',
      triggerEntity: 'TASK',
      triggerEvent: 'ASSIGNED',
      actionKind: getDefaultActionKind('TASK'),
      titleTemplate: '{{title}}',
      bodyTemplate: '',
      userIdField: getDefaultUserIdField('TASK'),
      linkUrlTemplate: getDefaultLinkTemplate('TASK'),
      recipientEmail: '',
      webhookUrl: '',
      webhookSecret: '',
      eventName: '',
      targetStatus: '',
      isActive: true,
      conditions: [],
    });
    setModalOpen(true);
  };

  const openEdit = (rule: AutomationRuleType) => {
    setEditingRule(rule);
    const config = (rule.actionConfig || {}) as Record<string, any>;
    const cond = rule.triggerConditions as Record<string, any> | null;
    const conditions = cond ? Object.entries(cond).map(([field, value]) => ({ field, value: String(value) })) : [];
    const actionKind = String(config.actionKind || 'CREATE_NOTIFICATION');
    setForm({
      name: rule.name,
      triggerEntity: rule.triggerEntity,
      triggerEvent: rule.triggerEvent,
      actionKind,
      titleTemplate: config.titleTemplate ?? '{{title}}',
      bodyTemplate: config.bodyTemplate ?? '',
      userIdField: config.userIdField ?? getDefaultUserIdField(rule.triggerEntity),
      linkUrlTemplate: config.linkUrlTemplate ?? getDefaultLinkTemplate(rule.triggerEntity),
      recipientEmail: config.recipientEmail ?? '',
      webhookUrl: config.webhookUrl ?? '',
      webhookSecret: config.webhookSecret ?? '',
      eventName: config.eventName ?? '',
      targetStatus: config.targetStatus ?? '',
      isActive: rule.isActive,
      conditions,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const triggerConditions = form.conditions.length
      ? form.conditions.reduce((acc, c) => ({ ...acc, [c.field]: c.value }), {} as Record<string, string>)
      : undefined;
    const actionConfig = {
      actionKind: form.actionKind,
      titleTemplate: form.titleTemplate,
      bodyTemplate: form.bodyTemplate || undefined,
      userIdField: form.userIdField,
      linkUrlTemplate: form.linkUrlTemplate || undefined,
      recipientEmail: form.recipientEmail || undefined,
      webhookUrl: form.webhookUrl || undefined,
      webhookSecret: form.webhookSecret || undefined,
      eventName: form.eventName || undefined,
      targetStatus: form.targetStatus || undefined,
    };
    try {
      if (editingRule) {
        await api.automation.updateRule(editingRule.id, {
          name: form.name,
          triggerEntity: form.triggerEntity,
          triggerEvent: form.triggerEvent,
          triggerConditions,
          actionConfig,
          isActive: form.isActive,
        });
        toast.success('Rule updated');
      } else {
        await api.automation.createRule({
          name: form.name,
          triggerEntity: form.triggerEntity,
          triggerEvent: form.triggerEvent,
          triggerConditions,
          actionType: 'CREATE_NOTIFICATION',
          actionConfig,
          isActive: form.isActive,
        });
        toast.success('Rule created');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    const shouldDelete = await confirm({
      title: 'Delete automation rule',
      message: 'Delete this automation rule?',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.automation.deleteRule(id);
      toast.success('Rule deleted');
      load();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (rule: AutomationRuleType) => {
    try {
      await api.automation.updateRule(rule.id, { isActive: !rule.isActive });
      toast.success(rule.isActive ? 'Rule disabled' : 'Rule enabled');
      load();
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-white flex items-center gap-2">
            <Workflow className="w-8 h-8 text-cyan-500" />
            {t('automations') || 'Automations'}
          </h1>
          <p className="text-slate-400 mt-1">Rules that run when tasks or findings change.</p>
        </div>
        <PermissionGate permission={Permission.MANAGE_PROJECTS}>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> {t('add_rule') || 'Add rule'}
          </Button>
        </PermissionGate>
      </div>

      {loading ? (
        <p className="text-slate-500 py-8">Loading...</p>
      ) : rules.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-slate-500 mb-4">No automation rules yet.</p>
          <PermissionGate permission={Permission.MANAGE_PROJECTS}>
            <Button variant="secondary" onClick={openCreate}>Create your first rule</Button>
          </PermissionGate>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <GlassCard key={rule.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{rule.name}</span>
                  {!rule.isActive && (
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">Disabled</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                    {(rule.actionConfig as Record<string, any>)?.actionKind || 'CREATE_NOTIFICATION'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  When <strong>{rule.triggerEntity}</strong> is <strong>{rule.triggerEvent.toLowerCase().replace(/_/g, ' ')}</strong>
                  {rule._count != null && rule._count.logs > 0 && (
                    <span className="ml-2 text-slate-500">· {rule._count.logs} runs</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleActive(rule)}
                  className="p-2 text-slate-400 hover:text-cyan-400"
                  title={rule.isActive ? 'Disable' : 'Enable'}
                >
                  {rule.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <PermissionGate permission={Permission.MANAGE_PROJECTS}>
                  <button type="button" onClick={() => openEdit(rule)} className="p-2 text-slate-400 hover:text-cyan-400">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(rule.id)} className="p-2 text-slate-400 hover:text-rose-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </PermissionGate>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? (t('edit_rule') || 'Edit rule') : (t('add_rule') || 'Add rule')}
      >
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Notify assignee when task assigned"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Trigger entity</Label>
              <select
                value={form.triggerEntity}
                onChange={(e) => {
                  const entity = e.target.value;
                  setForm(f => ({
                    ...f,
                    triggerEntity: entity,
                    userIdField: getDefaultUserIdField(entity),
                    linkUrlTemplate: getDefaultLinkTemplate(entity),
                  }));
                }}
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2"
              >
                {TRIGGER_ENTITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Trigger event</Label>
              <select
                value={form.triggerEvent}
                onChange={(e) => setForm(f => ({ ...f, triggerEvent: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2"
              >
                {TRIGGER_EVENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Action kind</Label>
            <select
              value={form.actionKind}
              onChange={(e) => setForm(f => ({ ...f, actionKind: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2"
            >
              {ACTION_KINDS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>{form.actionKind === 'SEND_EMAIL' ? 'Email title template' : 'Notification title template'} (use {'{{title}}'}, {'{{projectId}}'})</Label>
            <Input
              value={form.titleTemplate}
              onChange={(e) => setForm(f => ({ ...f, titleTemplate: e.target.value }))}
              placeholder="{{title}}"
              className="mt-1"
            />
          </div>
          <div>
            <Label>{form.actionKind === 'SEND_EMAIL' ? 'Email body template' : 'Notification body template'} (optional)</Label>
            <Input
              value={form.bodyTemplate}
              onChange={(e) => setForm(f => ({ ...f, bodyTemplate: e.target.value }))}
              placeholder="e.g. Task {{title}} is now in progress"
              className="mt-1"
            />
          </div>
          {(form.actionKind === 'CREATE_NOTIFICATION' || form.actionKind === 'SEND_EMAIL' || form.actionKind === 'ASSIGN_USER') && (
            <div>
              <Label>User ID field (assigneeId for Task, assignedToId for Finding)</Label>
              <Input
                value={form.userIdField}
                onChange={(e) => setForm(f => ({ ...f, userIdField: e.target.value }))}
                className="mt-1"
              />
            </div>
          )}
          {form.actionKind === 'CREATE_NOTIFICATION' && (
            <div>
              <Label>Link URL template (optional)</Label>
              <Input
                value={form.linkUrlTemplate}
                onChange={(e) => setForm(f => ({ ...f, linkUrlTemplate: e.target.value }))}
                placeholder="/app/projects/{{projectId}}?tab=tasks"
                className="mt-1"
              />
            </div>
          )}
          {form.actionKind === 'SEND_EMAIL' && (
            <div>
              <Label>Recipient email override (optional)</Label>
              <Input
                value={form.recipientEmail}
                onChange={(e) => setForm(f => ({ ...f, recipientEmail: e.target.value }))}
                placeholder="name@example.com"
                className="mt-1"
              />
            </div>
          )}
          {form.actionKind === 'DISPATCH_WEBHOOK' && (
            <>
              <div>
                <Label>Webhook URL</Label>
                <Input
                  value={form.webhookUrl}
                  onChange={(e) => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                  placeholder="https://example.com/webhook"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Webhook secret (optional)</Label>
                <Input
                  value={form.webhookSecret}
                  onChange={(e) => setForm(f => ({ ...f, webhookSecret: e.target.value }))}
                  placeholder="shared secret for signature verification"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Event name</Label>
                <Input
                  value={form.eventName}
                  onChange={(e) => setForm(f => ({ ...f, eventName: e.target.value }))}
                  placeholder="automation.task.assigned"
                  className="mt-1"
                />
              </div>
            </>
          )}
          {(form.actionKind === 'UPDATE_STATUS' || form.actionKind === 'ASSIGN_USER') && (
            <div>
              <Label>{form.actionKind === 'UPDATE_STATUS' ? 'Target status' : 'Target user ID override (optional)'}</Label>
              <Input
                value={form.actionKind === 'UPDATE_STATUS' ? form.targetStatus : form.userIdField}
                onChange={(e) => setForm(f => (
                  form.actionKind === 'UPDATE_STATUS'
                    ? { ...f, targetStatus: e.target.value }
                    : { ...f, userIdField: e.target.value }
                ))}
                placeholder={form.actionKind === 'UPDATE_STATUS' ? 'DONE' : 'User ID'}
                className="mt-1"
              />
            </div>
          )}
          <div>
            <Label>Conditions (optional) — rule runs only when entity matches</Label>
            <div className="mt-1 space-y-2">
              {form.conditions.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={c.field}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      conditions: f.conditions.map((cc, j) => j === i ? { ...cc, field: e.target.value } : cc),
                    }))}
                    placeholder="Field (e.g. status)"
                    className="flex-1"
                  />
                  <Input
                    value={c.value}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      conditions: f.conditions.map((cc, j) => j === i ? { ...cc, value: e.target.value } : cc),
                    }))}
                    placeholder="Value"
                    className="flex-1"
                  />
                  <button type="button" onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))} className="text-rose-400 hover:text-rose-300 p-1">×</button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, { field: '', value: '' }] }))}>
                + Add condition
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="rounded border-slate-600"
            />
            <Label htmlFor="isActive">Active</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSubmit}>{editingRule ? t('save') : (t('add_rule') || 'Add rule')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Automations;
