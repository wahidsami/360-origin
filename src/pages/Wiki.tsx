import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, Pencil, Trash2, Save, X, History, Upload, Eye, Download } from 'lucide-react';
import { GlassCard, Button, Input, Label, Modal } from '../components/ui/UIComponents';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { useAppDialog } from '../contexts/DialogContext';
import { DocumentViewer } from '../components/DocumentViewer';
import { FileAsset } from '../types';

type WikiPageItem = { id: string; slug: string; title: string; updatedAt: string };

const Wiki: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const { confirm } = useAppDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const slugParam = searchParams.get('slug') || '';
  const [pages, setPages] = useState<WikiPageItem[]>([]);
  const [current, setCurrent] = useState<{ id: string; slug: string; title: string; body: string; updatedAt: string } | null>(null);
  const [attachments, setAttachments] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ slug: '', title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<{ id: string; title: string; createdAt: string }[]>([]);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [attachmentForm, setAttachmentForm] = useState({ displayName: '' });
  const [selectedAttachment, setSelectedAttachment] = useState<{ isOpen: boolean; url: string; filename: string; mimeType: string; fileId: string } | null>(null);

  const loadPages = async () => {
    try {
      const list = await api.wiki.listPages();
      setPages((list as WikiPageItem[]) || []);
    } catch (e) {
      toast.error(t('wiki_load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  useEffect(() => {
    if (!slugParam) {
      setCurrent(null);
      setAttachments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const page = await api.wiki.getBySlug(slugParam);
        if (!cancelled) setCurrent(page as any);
      } catch {
        if (!cancelled) {
          setCurrent(null);
          setAttachments([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slugParam]);

  useEffect(() => {
    if (!current?.id) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await api.wiki.getFiles(current.id);
        if (!cancelled) setAttachments(list || []);
      } catch {
        if (!cancelled) setAttachments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  const openCreate = () => {
    setEditForm({ slug: '', title: '', body: '' });
    setCurrent(null);
    setEditModalOpen(true);
  };

  const openEdit = (page: { id: string; slug: string; title: string; body: string }) => {
    setEditForm({ slug: page.slug, title: page.title, body: page.body });
    setCurrent(page as any);
    setEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let page: any;
      if (current?.id) {
        page = await api.wiki.update(current.id, { slug: editForm.slug, title: editForm.title, body: editForm.body });
        toast.success(t('wiki_page_updated'));
      } else {
        page = await api.wiki.create({ slug: editForm.slug, title: editForm.title, body: editForm.body });
        toast.success(t('wiki_page_created'));
      }
      setEditModalOpen(false);
      await loadPages();
      const slug = (page && page.slug) || editForm.slug || editForm.title.toLowerCase().replace(/\s+/g, '-');
      setSearchParams(slug ? { slug } : {});
      setCurrent(page || null);
    } catch (err: any) {
      toast.error(err?.message || t('wiki_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const shouldDelete = await confirm({
      title: t('wiki_delete_title'),
      message: t('wiki_delete_message'),
      confirmText: t('delete'),
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.wiki.delete(id);
      toast.success(t('wiki_page_deleted'));
      setCurrent(null);
      setSearchParams({});
      loadPages();
    } catch (e) {
      toast.error(t('wiki_delete_error'));
    }
  };

  const openVersions = async (pageId: string) => {
    try {
      const list = await api.wiki.getVersions(pageId);
      setVersions((list as any[]) || []);
      setVersionsModalOpen(true);
    } catch (e) {
      toast.error(t('wiki_versions_error'));
    }
  };

  const openAttachment = async (attachment: FileAsset, download: boolean = false) => {
    if (!current?.id) return;
    try {
      const url = await api.wiki.downloadFile(current.id, attachment.id, download);
      if (!url) return;
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      setSelectedAttachment({
        isOpen: true,
        url,
        filename: attachment.name,
        mimeType: attachment.mimeType || attachment.type || 'application/octet-stream',
        fileId: attachment.id,
      });
    } catch (error) {
      console.error('Failed to open attachment', error);
      toast.error(t('wiki_attachment_open_error'));
    }
  };

  const handleAttachmentUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!current?.id) return;
    const form = e.currentTarget;
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
    const file = fileInput?.files?.[0];
    if (!file) {
      toast.error(t('wiki_attachment_required'));
      return;
    }
    setAttachmentSaving(true);
    try {
      const result = await api.wiki.uploadFile(current.id, file, attachmentForm.displayName.trim() || undefined);
      if (!result) throw new Error('Upload failed');
      toast.success(t('wiki_attachment_uploaded'));
      setAttachmentModalOpen(false);
      setAttachmentForm({ displayName: '' });
      form.reset();
      const list = await api.wiki.getFiles(current.id);
      setAttachments(list || []);
    } catch (error: any) {
      toast.error(error?.message || t('wiki_attachment_upload_error'));
    } finally {
      setAttachmentSaving(false);
    }
  };

  const handleDeleteAttachment = async (attachment: FileAsset) => {
    if (!current?.id) return;
    const shouldDelete = await confirm({
      title: t('wiki_attachment_delete_title'),
      message: t('wiki_attachment_delete_message'),
      confirmText: t('delete'),
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.wiki.deleteFile(current.id, attachment.id);
      toast.success(t('wiki_attachment_deleted'));
      const list = await api.wiki.getFiles(current.id);
      setAttachments(list || []);
    } catch (error) {
      toast.error(t('wiki_attachment_delete_error'));
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-8 h-8 text-cyan-500" />
          {t('wiki')}
        </h1>
        <Button variant="outline" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> {t('wiki_new_page')}
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <GlassCard title={t('wiki_pages')} className="md:col-span-1">
          {loading ? (
            <p className="text-slate-500 text-sm">{t('loading')}</p>
          ) : (
            <ul className="space-y-1">
              {pages.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSearchParams({ slug: p.slug })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${slugParam === p.slug ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800/50'}`}
                  >
                    {p.title}
                  </button>
                </li>
              ))}
              {pages.length === 0 && <p className="text-slate-500 text-sm">{t('wiki_no_pages')}</p>}
            </ul>
          )}
        </GlassCard>

        <GlassCard title={current?.title || t('wiki_select_page')} className="md:col-span-2">
          {current ? (
            <>
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={() => openEdit(current)}>
                  <Pencil className="w-4 h-4 mr-1" /> {t('edit')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openVersions(current.id)}>
                  <History className="w-4 h-4 mr-1" /> {t('wiki_history')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAttachmentModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-1" /> {t('wiki_upload_attachment')}
                </Button>
                <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => handleDelete(current.id)}>
                  <Trash2 className="w-4 h-4 mr-1" /> {t('delete')}
                </Button>
              </div>
              <div className="prose prose-invert max-w-none">
                <div className="text-slate-400 text-sm mb-2">{t('wiki_updated')} {new Date(current.updatedAt).toLocaleString(isArabic ? 'ar' : 'en')}</div>
                <div className="whitespace-pre-wrap text-slate-200">{current.body}</div>
              </div>
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 mb-3">{t('wiki_attachments')}</h3>
                <div className="space-y-3">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100" title={attachment.name}>{attachment.name}</p>
                        <p className="text-xs text-slate-500">{attachment.mimeType || attachment.type || 'application/octet-stream'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openAttachment(attachment, false)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openAttachment(attachment, true)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => handleDeleteAttachment(attachment)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {attachments.length === 0 && <p className="text-slate-500 text-sm italic">{t('wiki_no_attachments')}</p>}
                </div>
              </div>
            </>
          ) : (
            <p className="text-slate-500">{t('wiki_select_page_hint')}</p>
          )}
        </GlassCard>
      </div>

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title={current?.id ? t('wiki_edit_page') : t('wiki_new_page')}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label>{t('wiki_slug')}</Label>
            <Input value={editForm.slug} onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))} placeholder={t('wiki_slug_placeholder')} className="mt-1" />
          </div>
          <div>
            <Label>{t('title')}</Label>
            <Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('wiki_title_placeholder')} required className="mt-1" />
          </div>
          <div>
            <Label>{t('content')}</Label>
            <textarea value={editForm.body} onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))} rows={12} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white mt-1" placeholder={t('wiki_body_placeholder')} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditModalOpen(false)}><X className="w-4 h-4 mr-1" /> {t('cancel')}</Button>
            <Button type="submit" disabled={saving}><Save className="w-4 h-4 mr-1" /> {saving ? t('wiki_saving') : t('save')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={versionsModalOpen} onClose={() => setVersionsModalOpen(false)} title={t('wiki_version_history')}>
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {versions.map((v) => (
            <li key={v.id} className="text-slate-300 text-sm flex justify-between">
              <span>{v.title}</span>
              <span className="text-slate-500">{new Date(v.createdAt).toLocaleString(isArabic ? 'ar' : 'en')}</span>
            </li>
          ))}
          {versions.length === 0 && <p className="text-slate-500 text-sm">{t('wiki_no_versions')}</p>}
        </ul>
      </Modal>

      <Modal isOpen={attachmentModalOpen} onClose={() => setAttachmentModalOpen(false)} title={t('wiki_upload_attachment')}>
        <form onSubmit={handleAttachmentUpload} className="space-y-4">
          <div>
            <Label>{t('file_name')}</Label>
            <Input
              value={attachmentForm.displayName}
              onChange={(e) => setAttachmentForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder={t('wiki_attachment_name_placeholder')}
              className="mt-1"
            />
          </div>
          <div>
            <Label>{t('file_name')}</Label>
            <Input type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,image/*" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAttachmentModalOpen(false)}><X className="w-4 h-4 mr-1" /> {t('cancel')}</Button>
            <Button type="submit" disabled={attachmentSaving}>{attachmentSaving ? t('wiki_saving') : t('upload')}</Button>
          </div>
        </form>
      </Modal>

      {selectedAttachment && (
        <Modal
          isOpen={selectedAttachment.isOpen}
          onClose={() => setSelectedAttachment(null)}
          title={selectedAttachment.filename}
          maxWidth="max-w-4xl"
        >
          <DocumentViewer
            url={selectedAttachment.url}
            filename={selectedAttachment.filename}
            mimeType={selectedAttachment.mimeType}
            onDownload={() => openAttachment({ id: selectedAttachment.fileId } as FileAsset, true)}
          />
        </Modal>
      )}
    </div>
  );
};

export default Wiki;
