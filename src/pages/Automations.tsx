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
  { value: 'TASK', labelKey: 'task' },
  { value: 'FINDING', labelKey: 'finding' },
  { value: 'INVOICE', labelKey: 'invoice' },
] as const;

const TRIGGER_EVENTS = [
  { value: 'CREATED', labelKey: 'created' },
  { value: 'UPDATED', labelKey: 'updated' },
  { value: 'STATUS_CHANGED', labelKey: 'status_changed' },
  { value: 'ASSIGNED', labelKey: 'assigned' },
] as const;

const ACTION_KINDS = [
  { value: 'CREATE_NOTIFICATION', labelKey: 'create_notification' },
  { value: 'SEND_EMAIL', labelKey: 'send_email' },
  { value: 'DISPATCH_WEBHOOK', labelKey: 'dispatch_webhook' },
  { value: 'UPDATE_STATUS', labelKey: 'update_status' },
  { value: 'ASSIGN_USER', labelKey: 'assign_user' },
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
      toast.error(t('failed_to_load_rules'));
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
      toast.error(t('name_is_required'));
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
        toast.success(t('rule_updated'));
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
        toast.success(t('rule_created'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t('failed_to_save_rule'));
    }
  };

  const handleDelete = async (id: string) => {
    const shouldDelete = await confirm({
      title: t('delete_automation_rule'),
      message: t('delete_automation_rule_confirm'),
      confirmText: t('delete'),
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.automation.deleteRule(id);
      toast.success(t('rule_deleted'));
      load();
    } catch (e) {
      toast.error(t('failed_to_delete'));
    }
  };

  const handleToggleActive = async (rule: AutomationRuleType) => {
    try {
      await api.automation.updateRule(rule.id, { isActive: !rule.isActive });
      toast.success(rule.isActive ? t('rule_disabled') : t('rule_enabled'));
      load();
    } catch (e) {
      toast.error(t('failed_to_update'));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-white flex items-center gap-2">
            <Workflow className="w-8 h-8 text-cyan-500" />
            {t('automations')}
          </h1>
          <p className="text-slate-400 mt-1">{t('automation_rules_subtitle')}</p>
        </div>
        <PermissionGate permission={Permission.MANAGE_PROJECTS}>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> {t('add_rule')}
          </Button>
        </PermissionGate>
      </div>

      {loading ? (
        <p className="text-slate-500 py-8">{t('loading_dots')}</p>
      ) : rules.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-slate-500 mb-4">{t('no_automation_rules')}</p>
          <PermissionGate permission={Permission.MANAGE_PROJECTS}>
            <Button variant="secondary" onClick={openCreate}>{t('create_first_rule')}</Button>
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
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">{t('disabled')}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                    {(rule.actionConfig as Record<string, any>)?.actionKind || 'CREATE_NOTIFICATION'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  {t('when_rule_applies')} <strong>{t(rule.triggerEntity.toLowerCase())}</strong> {t('is')} <strong>{t(rule.triggerEvent.toLowerCase())}</strong>
                  {rule._count != null && rule._count.logs > 0 && (
                    <span className="ml-2 text-slate-500">· {t('runs_count', { count: rule._count.logs })}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(rule)}
                    className="p-2 text-slate-400 hover:text-cyan-400"
                    title={rule.isActive ? t('disable') : t('enable')}
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
        title={editingRule ? t('edit_rule') : t('add_rule')}
      >
        <div className="space-y-4">
          <div>
            <Label>{t('name')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t('automation_name_placeholder')}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('trigger_entity')}</Label>
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
                {TRIGGER_ENTITIES.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <Label>{t('trigger_event')}</Label>
              <select
                value={form.triggerEvent}
                onChange={(e) => setForm(f => ({ ...f, triggerEvent: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2"
              >
                {TRIGGER_EVENTS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>{t('action_kind')}</Label>
            <select
              value={form.actionKind}
              onChange={(e) => setForm(f => ({ ...f, actionKind: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2"
            >
              {ACTION_KINDS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <Label>{form.actionKind === 'SEND_EMAIL' ? t('email_title_template') : t('notification_title_template')} ({t('use_placeholders')})</Label>
            <Input
              value={form.titleTemplate}
              onChange={(e) => setForm(f => ({ ...f, titleTemplate: e.target.value }))}
              placeholder="{{title}}"
              className="mt-1"
            />
          </div>
          <div>
            <Label>{form.actionKind === 'SEND_EMAIL' ? t('email_body_template') : t('notification_body_template')} ({t('optional')})</Label>
            <Input
              value={form.bodyTemplate}
              onChange={(e) => setForm(f => ({ ...f, bodyTemplate: e.target.value }))}
              placeholder="e.g. Task {{title}} is now in progress"
              className="mt-1"
            />
          </div>
          {(form.actionKind === 'CREATE_NOTIFICATION' || form.actionKind === 'SEND_EMAIL' || form.actionKind === 'ASSIGN_USER') && (
            <div>
              <Label>{t('user_id_field_hint')}</Label>
              <Input
                value={form.userIdField}
                onChange={(e) => setForm(f => ({ ...f, userIdField: e.target.value }))}
                className="mt-1"
              />
            </div>
          )}
          {form.actionKind === 'CREATE_NOTIFICATION' && (
            <div>
              <Label>{t('link_url_template_optional')}</Label>
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
              <Label>{t('recipient_email_override_optional')}</Label>
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
                <Label>{t('webhook_url')}</Label>
                <Input
                  value={form.webhookUrl}
                  onChange={(e) => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                  placeholder="https://example.com/webhook"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('webhook_secret_optional')}</Label>
                <Input
                  value={form.webhookSecret}
                  onChange={(e) => setForm(f => ({ ...f, webhookSecret: e.target.value }))}
                  placeholder="shared secret for signature verification"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('event_name')}</Label>
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
              <Label>{form.actionKind === 'UPDATE_STATUS' ? t('target_status') : t('target_user_id_override_optional')}</Label>
              <Input
                value={form.actionKind === 'UPDATE_STATUS' ? form.targetStatus : form.userIdField}
                onChange={(e) => setForm(f => (
                  form.actionKind === 'UPDATE_STATUS'
                    ? { ...f, targetStatus: e.target.value }
                    : { ...f, userIdField: e.target.value }
                ))}
                placeholder={form.actionKind === 'UPDATE_STATUS' ? 'DONE' : t('user_id')}
                className="mt-1"
              />
            </div>
          )}
          <div>
            <Label>{t('conditions_optional')}</Label>
            <div className="mt-1 space-y-2">
              {form.conditions.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={c.field}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      conditions: f.conditions.map((cc, j) => j === i ? { ...cc, field: e.target.value } : cc),
                    }))}
                    placeholder={t('condition_field_placeholder')}
                    className="flex-1"
                  />
                  <Input
                    value={c.value}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      conditions: f.conditions.map((cc, j) => j === i ? { ...cc, value: e.target.value } : cc),
                    }))}
                    placeholder={t('value')}
                    className="flex-1"
                  />
                  <button type="button" onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))} className="text-rose-400 hover:text-rose-300 p-1">×</button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, { field: '', value: '' }] }))}>
                + {t('add_condition')}
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
            <Label htmlFor="isActive">{t('active')}</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSubmit}>{editingRule ? t('save') : t('add_rule')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Automations;
