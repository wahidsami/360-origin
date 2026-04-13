import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Plus, Pencil, Trash2, MessageSquare, Github, Send } from 'lucide-react';
import { GlassCard, Button, Input, Label, Modal } from '../components/ui/UIComponents';
import { api } from '../services/api';
import { useAppDialog } from '../contexts/DialogContext';
import toast from 'react-hot-toast';

type IntegrationItem = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
};

type WebhookItem = {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
};

const Integrations: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const { confirm } = useAppDialog();

  const copy = isArabic
    ? {
        pageTitle: 'التكاملات',
        pageSubtitle: 'اربط Slack و GitHub و Webhooks الصادرة.',
        sectionSlackGithub: 'Slack و GitHub',
        sectionSlackDesc:
          'يمكن إرسال الإشعارات إلى Slack عند الإنشاء. أضف Slack Incoming Webhook ويمكنك اختباره اختياريًا.',
        sectionOutgoingWebhooks: 'الويب هوكس الصادرة',
        sectionWebhookDesc:
          'استدعاءات HTTP للأحداث (مثل task.created). ستستقبل نقطة النهاية طلب POST يحتوي JSON.',
        failedLoad: 'فشل التحميل',
        integrationUpdated: 'تم تحديث التكامل',
        integrationAdded: 'تمت إضافة التكامل',
        failedSave: 'فشل الحفظ',
        deleted: 'تم الحذف',
        failedDelete: 'فشل الحذف',
        testSlackSuccess: 'تم إرسال رسالة اختبار إلى Slack',
        testFailed: 'فشل الاختبار',
        webhookUpdated: 'تم تحديث Webhook',
        webhookAdded: 'تمت إضافة Webhook',
        issueCreated: 'تم إنشاء التذكرة #{{number}}',
        failedCreateIssue: 'فشل إنشاء التذكرة',
        loading: 'جارٍ التحميل...',
        noIntegrationsYet: 'لا توجد تكاملات بعد.',
        noWebhooksYet: 'لا توجد Webhooks بعد.',
        disabled: 'معطّل',
        test: 'اختبار',
        sending: 'جارٍ الإرسال...',
        newIssue: 'تذكرة جديدة',
        addIntegration: 'إضافة تكامل',
        addWebhook: 'إضافة Webhook',
        editIntegrationTitle: 'تعديل التكامل',
        addIntegrationTitle: 'إضافة تكامل',
        type: 'النوع',
        name: 'الاسم',
        webhookUrl: 'رابط Webhook',
        channelOptional: 'القناة (اختياري)',
        personalAccessToken: 'رمز الوصول الشخصي',
        repoOwnerRepo: 'المستودع (owner/repo)',
        leaveBlankToKeep: 'اتركه فارغًا للاحتفاظ بالقيمة الحالية',
        enabled: 'مفعّل',
        cancel: 'إلغاء',
        save: 'حفظ',
        saving: 'جارٍ الحفظ...',
        editWebhookTitle: 'تعديل Webhook',
        addWebhookTitle: 'إضافة Webhook',
        url: 'الرابط',
        secretOptional: 'المفتاح السري (اختياري)',
        events: 'الأحداث',
        createGithubIssueTitle: 'إنشاء تذكرة GitHub',
        title: 'العنوان',
        body: 'المحتوى',
        createIssue: 'إنشاء تذكرة',
        creating: 'جارٍ الإنشاء...',
        deleteIntegrationTitle: 'حذف التكامل',
        deleteIntegrationMessage: 'هل تريد حذف هذا التكامل؟',
        deleteWebhookTitle: 'حذف Webhook',
        deleteWebhookMessage: 'هل تريد حذف هذا Webhook؟',
      }
    : {
        pageTitle: 'Integrations',
        pageSubtitle: 'Connect Slack, GitHub, and outgoing webhooks.',
        sectionSlackGithub: 'Slack & GitHub',
        sectionSlackDesc:
          'Notifications can be sent to Slack when created. Add a Slack Incoming Webhook and optionally test it.',
        sectionOutgoingWebhooks: 'Outgoing webhooks',
        sectionWebhookDesc:
          'HTTP callbacks for events (e.g. task.created). Your endpoint will receive a POST with a JSON payload.',
        failedLoad: 'Failed to load',
        integrationUpdated: 'Integration updated',
        integrationAdded: 'Integration added',
        failedSave: 'Failed to save',
        deleted: 'Deleted',
        failedDelete: 'Failed to delete',
        testSlackSuccess: 'Test message sent to Slack',
        testFailed: 'Test failed',
        webhookUpdated: 'Webhook updated',
        webhookAdded: 'Webhook added',
        issueCreated: 'Issue #{{number}} created',
        failedCreateIssue: 'Failed to create issue',
        loading: 'Loading...',
        noIntegrationsYet: 'No integrations yet.',
        noWebhooksYet: 'No webhooks yet.',
        disabled: 'Disabled',
        test: 'Test',
        sending: 'Sending...',
        newIssue: 'New issue',
        addIntegration: 'Add integration',
        addWebhook: 'Add webhook',
        editIntegrationTitle: 'Edit integration',
        addIntegrationTitle: 'Add integration',
        type: 'Type',
        name: 'Name',
        webhookUrl: 'Webhook URL',
        channelOptional: 'Channel (optional)',
        personalAccessToken: 'Personal access token',
        repoOwnerRepo: 'Repo (owner/repo)',
        leaveBlankToKeep: 'Leave blank to keep',
        enabled: 'Enabled',
        cancel: 'Cancel',
        save: 'Save',
        saving: 'Saving...',
        editWebhookTitle: 'Edit webhook',
        addWebhookTitle: 'Add webhook',
        url: 'URL',
        secretOptional: 'Secret (optional)',
        events: 'Events',
        createGithubIssueTitle: 'Create GitHub issue',
        title: 'Title',
        body: 'Body',
        createIssue: 'Create issue',
        creating: 'Creating...',
        deleteIntegrationTitle: 'Delete integration',
        deleteIntegrationMessage: 'Delete this integration?',
        deleteWebhookTitle: 'Delete webhook',
        deleteWebhookMessage: 'Delete this webhook?',
      };

  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [intModalOpen, setIntModalOpen] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [editingInt, setEditingInt] = useState<IntegrationItem | null>(null);
  const [editingWebhook, setEditingWebhook] = useState<WebhookItem | null>(null);
  const [intForm, setIntForm] = useState({
    type: 'SLACK' as 'SLACK' | 'GITHUB',
    name: '',
    enabled: true,
    webhookUrl: '',
    channel: '',
    token: '',
    repo: '',
  });
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    secret: '',
    events: [] as string[],
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [githubIssueModal, setGithubIssueModal] = useState<{ integrationId: string } | null>(null);
  const [githubIssueForm, setGithubIssueForm] = useState({ title: '', body: '' });
  const [sendingTest, setSendingTest] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [intList, whList] = await Promise.all([api.integrations.list(), api.webhooks.list()]);
      setIntegrations((intList || []) as IntegrationItem[]);
      setWebhooks((whList || []) as WebhookItem[]);
    } catch (e) {
      console.error('Failed to load', e);
      toast.error(copy.failedLoad);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openIntModal = (item?: IntegrationItem) => {
    if (item) {
      setEditingInt(item);
      const c = (item.config || {}) as Record<string, string>;
      setIntForm({
        type: item.type as 'SLACK' | 'GITHUB',
        name: item.name,
        enabled: item.enabled,
        webhookUrl: c.webhookUrl || '',
        channel: c.channel || '',
        token: '',
        repo: c.repo || '',
      });
    } else {
      setEditingInt(null);
      setIntForm({ type: 'SLACK', name: '', enabled: true, webhookUrl: '', channel: '', token: '', repo: '' });
    }
    setIntModalOpen(true);
  };

  const saveIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingInt) {
        const existingConfig = (editingInt.config || {}) as Record<string, unknown>;
        const updateConfig =
          intForm.type === 'SLACK'
            ? { webhookUrl: intForm.webhookUrl || existingConfig.webhookUrl, channel: intForm.channel || existingConfig.channel }
            : {
                ...existingConfig,
                repo: intForm.repo || existingConfig.repo,
                ...(intForm.token && intForm.token !== '••••••••' ? { token: intForm.token } : {}),
              };
        await api.integrations.update(editingInt.id, {
          name: intForm.name,
          enabled: intForm.enabled,
          config: updateConfig,
        });
        toast.success(copy.integrationUpdated);
      } else {
        const config =
          intForm.type === 'SLACK'
            ? { webhookUrl: intForm.webhookUrl || undefined, channel: intForm.channel || undefined }
            : { token: intForm.token || undefined, repo: intForm.repo || undefined };
        await api.integrations.create({
          type: intForm.type,
          name: intForm.name,
          enabled: intForm.enabled,
          config: config as Record<string, unknown>,
        });
        toast.success(copy.integrationAdded);
      }
      setIntModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || copy.failedSave);
    } finally {
      setSaving(false);
    }
  };

  const deleteIntegration = async (id: string) => {
    const shouldDelete = await confirm({
      title: copy.deleteIntegrationTitle,
      message: copy.deleteIntegrationMessage,
      confirmText: t('delete'),
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.integrations.delete(id);
      toast.success(copy.deleted);
      load();
    } catch {
      toast.error(copy.failedDelete);
    }
  };

  const testSlack = async (id: string) => {
    setSendingTest(id);
    try {
      await api.integrations.testSlack(id);
      toast.success(copy.testSlackSuccess);
    } catch (err: any) {
      toast.error(err?.message || copy.testFailed);
    } finally {
      setSendingTest(null);
    }
  };

  const openWebhookModal = (item?: WebhookItem) => {
    if (item) {
      setEditingWebhook(item);
      setWebhookForm({ name: item.name, url: item.url, secret: '', events: item.events || [], enabled: item.enabled });
    } else {
      setEditingWebhook(null);
      setWebhookForm({ name: '', url: '', secret: '', events: [], enabled: true });
    }
    setWebhookModalOpen(true);
  };

  const saveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingWebhook) {
        await api.webhooks.update(editingWebhook.id, {
          name: webhookForm.name,
          url: webhookForm.url,
          ...(webhookForm.secret && { secret: webhookForm.secret }),
          events: webhookForm.events,
          enabled: webhookForm.enabled,
        });
        toast.success(copy.webhookUpdated);
      } else {
        await api.webhooks.create({
          name: webhookForm.name,
          url: webhookForm.url,
          ...(webhookForm.secret && { secret: webhookForm.secret }),
          events: webhookForm.events,
          enabled: webhookForm.enabled,
        });
        toast.success(copy.webhookAdded);
      }
      setWebhookModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || copy.failedSave);
    } finally {
      setSaving(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    const shouldDelete = await confirm({
      title: copy.deleteWebhookTitle,
      message: copy.deleteWebhookMessage,
      confirmText: t('delete'),
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.webhooks.delete(id);
      toast.success(copy.deleted);
      load();
    } catch {
      toast.error(copy.failedDelete);
    }
  };

  const submitGitHubIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubIssueModal) return;
    setSaving(true);
    try {
      const res = await api.integrations.createGitHubIssue(
        githubIssueModal.integrationId,
        githubIssueForm.title,
        githubIssueForm.body,
      );
      toast.success(copy.issueCreated.replace('{{number}}', String((res as any).number)));
      setGithubIssueModal(null);
      setGithubIssueForm({ title: '', body: '' });
    } catch (err: any) {
      toast.error(err?.message || copy.failedCreateIssue);
    } finally {
      setSaving(false);
    }
  };

  const EVENT_OPTIONS = [
    'task.created',
    'task.updated',
    'invoice.created',
    'invoice.updated',
    'invoice.overdue',
    'invoice.paid',
    'finding.created',
    'finding.updated',
    'approval.requested',
    'approval.reviewed',
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold font-display text-white">{t('integrations') || copy.pageTitle}</h1>
        <p className="text-slate-400 mt-1">{copy.pageSubtitle}</p>
      </div>

      <GlassCard title={copy.sectionSlackGithub} className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-cyan-500" />
        <div className="flex-1 space-y-4">
          <p className="text-slate-400 text-sm">{copy.sectionSlackDesc}</p>
          {loading ? (
            <p className="text-slate-500">{copy.loading}</p>
          ) : (
            <>
              <div className="space-y-2">
                {integrations.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800/30 border border-slate-700/50"
                  >
                    <div className="flex items-center gap-3">
                      {i.type === 'SLACK' ? (
                        <MessageSquare className="w-5 h-5 text-[hsl(var(--brand-success))]" />
                      ) : (
                        <Github className="w-5 h-5 text-slate-200" />
                      )}
                      <div>
                        <span className="font-medium text-white">{i.name}</span>
                        <span className="ml-2 text-slate-500 text-sm">{i.type}</span>
                        {!i.enabled && (
                          <span className="ml-2 text-[hsl(var(--brand-warning))] text-xs">{copy.disabled}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {i.type === 'SLACK' && (
                        <Button variant="ghost" size="sm" onClick={() => testSlack(i.id)} disabled={sendingTest === i.id}>
                          <Send className="w-4 h-4 mr-1" /> {sendingTest === i.id ? copy.sending : copy.test}
                        </Button>
                      )}
                      {i.type === 'GITHUB' && (
                        <Button variant="ghost" size="sm" onClick={() => setGithubIssueModal({ integrationId: i.id })}>
                          {copy.newIssue}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openIntModal(i)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-400"
                        onClick={() => deleteIntegration(i.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {integrations.length === 0 && <p className="text-slate-500 text-sm">{copy.noIntegrationsYet}</p>}
              </div>
              <Button variant="outline" onClick={() => openIntModal()}>
                <Plus className="w-4 h-4 mr-2" /> {copy.addIntegration}
              </Button>
            </>
          )}
        </div>
      </GlassCard>

      <GlassCard title={copy.sectionOutgoingWebhooks} className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-cyan-500" />
        <div className="flex-1 space-y-4">
          <p className="text-slate-400 text-sm">{copy.sectionWebhookDesc}</p>
          {loading ? (
            <p className="text-slate-500">{copy.loading}</p>
          ) : (
            <>
              <div className="space-y-2">
                {webhooks.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800/30 border border-slate-700/50"
                  >
                    <div>
                      <span className="font-medium text-white">{w.name}</span>
                      <span className="ml-2 text-slate-500 text-xs truncate max-w-xs inline-block">{w.url}</span>
                      {w.events?.length > 0 && (
                        <div className="text-slate-500 text-xs mt-1">
                          {copy.events}: {w.events.join(', ')}
                        </div>
                      )}
                      {!w.enabled && (
                        <span className="ml-2 text-[hsl(var(--brand-warning))] text-xs">{copy.disabled}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openWebhookModal(w)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-400"
                        onClick={() => deleteWebhook(w.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {webhooks.length === 0 && <p className="text-slate-500 text-sm">{copy.noWebhooksYet}</p>}
              </div>
              <Button variant="outline" onClick={() => openWebhookModal()}>
                <Plus className="w-4 h-4 mr-2" /> {copy.addWebhook}
              </Button>
            </>
          )}
        </div>
      </GlassCard>

      <Modal
        isOpen={intModalOpen}
        onClose={() => setIntModalOpen(false)}
        title={editingInt ? copy.editIntegrationTitle : copy.addIntegrationTitle}
      >
        <form onSubmit={saveIntegration} className="space-y-4">
          <div>
            <Label>{copy.type}</Label>
            <select
              value={intForm.type}
              onChange={(e) => setIntForm((f) => ({ ...f, type: e.target.value as 'SLACK' | 'GITHUB' }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
              disabled={!!editingInt}
            >
              <option value="SLACK">Slack</option>
              <option value="GITHUB">GitHub</option>
            </select>
          </div>
          <Input
            label={copy.name}
            value={intForm.name}
            onChange={(e) => setIntForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. #project-alerts"
            required
          />
          {intForm.type === 'SLACK' && (
            <>
              <Input
                label={copy.webhookUrl}
                type="url"
                value={intForm.webhookUrl}
                onChange={(e) => setIntForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                placeholder="https://hooks.slack.com/..."
              />
              <Input
                label={copy.channelOptional}
                value={intForm.channel}
                onChange={(e) => setIntForm((f) => ({ ...f, channel: e.target.value }))}
                placeholder="#channel"
              />
            </>
          )}
          {intForm.type === 'GITHUB' && (
            <>
              <Input
                label={copy.personalAccessToken}
                type="password"
                value={intForm.token}
                onChange={(e) => setIntForm((f) => ({ ...f, token: e.target.value }))}
                placeholder={editingInt ? copy.leaveBlankToKeep : 'ghp_...'}
              />
              <Input
                label={copy.repoOwnerRepo}
                value={intForm.repo}
                onChange={(e) => setIntForm((f) => ({ ...f, repo: e.target.value }))}
                placeholder="acme/repo"
                required={!editingInt}
              />
            </>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="int-enabled"
              checked={intForm.enabled}
              onChange={(e) => setIntForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="rounded border-slate-600"
            />
            <Label htmlFor="int-enabled">{copy.enabled}</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIntModalOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? copy.saving : copy.save}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={webhookModalOpen}
        onClose={() => setWebhookModalOpen(false)}
        title={editingWebhook ? copy.editWebhookTitle : copy.addWebhookTitle}
      >
        <form onSubmit={saveWebhook} className="space-y-4">
          <Input
            label={copy.name}
            value={webhookForm.name}
            onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="My endpoint"
            required
          />
          <Input
            label={copy.url}
            type="url"
            value={webhookForm.url}
            onChange={(e) => setWebhookForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://..."
            required
          />
          <Input
            label={copy.secretOptional}
            type="password"
            value={webhookForm.secret}
            onChange={(e) => setWebhookForm((f) => ({ ...f, secret: e.target.value }))}
            placeholder="HMAC secret"
          />
          <div>
            <Label>{copy.events}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EVENT_OPTIONS.map((ev) => (
                <label key={ev} className="flex items-center gap-1 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={webhookForm.events.includes(ev)}
                    onChange={(e) =>
                      setWebhookForm((f) => ({
                        ...f,
                        events: e.target.checked ? [...f.events, ev] : f.events.filter((x) => x !== ev),
                      }))
                    }
                    className="rounded border-slate-600"
                  />
                  {ev}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wh-enabled"
              checked={webhookForm.enabled}
              onChange={(e) => setWebhookForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="rounded border-slate-600"
            />
            <Label htmlFor="wh-enabled">{copy.enabled}</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setWebhookModalOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? copy.saving : copy.save}
            </Button>
          </div>
        </form>
      </Modal>

      {githubIssueModal && (
        <Modal
          isOpen={!!githubIssueModal}
          onClose={() => {
            setGithubIssueModal(null);
            setGithubIssueForm({ title: '', body: '' });
          }}
          title={copy.createGithubIssueTitle}
        >
          <form onSubmit={submitGitHubIssue} className="space-y-4">
            <Input
              label={copy.title}
              value={githubIssueForm.title}
              onChange={(e) => setGithubIssueForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <div>
              <Label>{copy.body}</Label>
              <textarea
                value={githubIssueForm.body}
                onChange={(e) => setGithubIssueForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setGithubIssueModal(null)}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? copy.creating : copy.createIssue}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Integrations;
