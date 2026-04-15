import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileAsset, Permission } from '@/types';
import { Button, GlassCard, Badge, Modal, Input } from '../ui/UIComponents';
import { Upload, File, FileText, Image, Download, Eye, X, Trash2 } from 'lucide-react';
import { DocumentViewer } from '../DocumentViewer';
import { PermissionGate } from '../PermissionGate';
import { formatDistanceToNow } from 'date-fns';
import { useAppDialog } from '../../contexts/DialogContext';

interface FilesTabProps {
    files: FileAsset[];
    onUpload: (file: File, metadata: { name: string; category: string; visibility: string }) => Promise<void>;
    onDownload?: (fileId: string, download?: boolean) => Promise<string | undefined>;
    onDelete?: (fileId: string) => Promise<void>;
    canUpload?: boolean;
    canDelete?: boolean;
}

export const FilesTab: React.FC<FilesTabProps> = ({ files, onUpload, onDownload, onDelete, canUpload = false, canDelete = false }) => {
    const { t } = useTranslation();
    const { alert, confirm } = useAppDialog();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [viewModal, setViewModal] = useState<{ isOpen: boolean; url: string; filename: string; mimeType: string; fileId: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) {
            await alert({
                title: t('upload_file'),
                message: t('please_select_file'),
                confirmText: t('ok') || 'OK',
            });
            return;
        }

        const formData = new FormData(e.target as HTMLFormElement);
        const metadata = {
            name: (formData.get('name') as string) || selectedFile.name,
            category: formData.get('category') as any,
            visibility: formData.get('visibility') as any,
        };

        setIsUploading(true);
        try {
            await onUpload(selectedFile, metadata);
            setIsModalOpen(false);
            setSelectedFile(null);
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDownload = async (file: FileAsset) => {
        setDownloadingId(file.id);
        try {
            let url = file.url;
            if (onDownload) {
                url = (await onDownload(file.id, true)) || file.url;
            }
            if (url) {
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                await alert({
                    title: t('download'),
                    message: t('download_url_not_available'),
                    confirmText: t('ok') || 'OK',
                });
            }
        } catch (err) {
            console.error('Download failed', err);
            await alert({
                title: t('download'),
                message: t('failed_to_download'),
                confirmText: t('ok') || 'OK',
            });
        } finally {
            setDownloadingId(null);
        }
    };

    const handleView = async (file: FileAsset) => {
        setDownloadingId(file.id);
        try {
            let url = file.url;
            if (onDownload) {
                url = (await onDownload(file.id, false)) || file.url;
            }
            if (url) {
                setViewModal({
                    isOpen: true,
                    url,
                    filename: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    fileId: file.id
                });
            } else {
                await alert({
                    title: t('view'),
                    message: t('view_url_not_available'),
                    confirmText: t('ok') || 'OK',
                });
            }
        } catch (err) {
            console.error('View failed', err);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleDelete = async (file: FileAsset) => {
        const shouldDelete = await confirm({
            title: t('delete_file') || 'Delete File',
            message: t('confirm_delete_file').replace('{{name}}', file.name),
            confirmText: t('delete') || 'Delete',
            cancelText: t('cancel') || 'Cancel',
            tone: 'danger',
        });
        if (!shouldDelete) return;
        if (onDelete) {
            setDownloadingId(file.id);
            try {
                await onDelete(file.id);
            } catch (err) {
                console.error('Delete failed', err);
                await alert({
                    title: t('delete_file') || 'Delete File',
                    message: t('failed_to_delete_file'),
                    confirmText: t('ok') || 'OK',
                });
            } finally {
                setDownloadingId(null);
            }
        }
    };

    const getFileIcon = (type?: string) => {
        if (!type) return <File className="w-8 h-8 text-cyan-400" />;
        if (type.includes('image')) return <Image className="w-8 h-8 text-purple-400" />;
        if (type.includes('pdf')) return <FileText className="w-8 h-8 text-rose-400" />;
        return <File className="w-8 h-8 text-cyan-400" />;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">{t('project_files')}</h3>
                {canUpload ? (
                    <Button onClick={() => setIsModalOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" /> {t('upload_file')}
                    </Button>
                ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.map(file => (
                    <GlassCard key={file.id} className="p-4 flex items-start justify-between group hover:border-cyan-500/50 transition-all">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-800 rounded-lg">
                                {getFileIcon(file.type)}
                            </div>
                            <div className="overflow-hidden">
                                <h4 className="font-medium text-white truncate max-w-[150px]" title={file.name}>{file.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge size="sm" variant="neutral" className="text-[10px]">{file.category}</Badge>
                                    <span className="text-xs text-slate-500">{file.size}</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    {file.uploadedAt && !isNaN(new Date(file.uploadedAt).getTime()) ? 
                                        t('uploaded_ago_by').replace('{{time}}', formatDistanceToNow(new Date(file.uploadedAt))).replace('{{name}}', file.uploaderName || t('unknown')) : 
                                        t('uploaded_unknown_date_by').replace('{{name}}', file.uploaderName || t('unknown'))}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-row flex-wrap gap-2 md:flex-col md:justify-start">
                            <button
                                onClick={() => handleDownload(file)}
                                disabled={downloadingId === file.id}
                                className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-white disabled:opacity-50"
                                title={t('download')}
                                aria-label={t('download')}
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleView(file)}
                                disabled={downloadingId === file.id}
                                className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-50"
                                title={file.visibility || t('view')}
                                aria-label={t('view')}
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                            {onDelete && canDelete && file.scopeType !== 'CLIENT' && (
                                <button
                                    onClick={() => handleDelete(file)}
                                    disabled={downloadingId === file.id}
                                    className="p-2 bg-rose-900/40 hover:bg-rose-700/60 rounded text-rose-400 hover:text-rose-200 disabled:opacity-50"
                                    title={t('delete')}
                                    aria-label={t('delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </GlassCard>
                ))}
                {files.length === 0 && (
                    <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-700 rounded-xl">
                        <Upload className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>{t('no_files')}</p>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedFile(null); }} title={t('upload_file')}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center bg-slate-800/20 hover:bg-slate-800/40 transition-colors cursor-pointer relative"
                    >
                        {selectedFile ? (
                            <div className="flex flex-col items-center">
                                <FileText className="w-10 h-10 text-cyan-400 mb-2" />
                                <p className="text-white font-medium truncate max-w-full px-4">{selectedFile.name}</p>
                                <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                    className="mt-2 text-rose-400 hover:text-rose-300 flex items-center gap-1 text-xs"
                                >
                                    <X className="w-3 h-3" /> {t('remove_file')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <Upload className="w-10 h-10 mx-auto text-slate-500 mb-2" />
                                <p className="text-slate-300">{t('click_or_drag_file')}</p>
                            </>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                    </div>
                    <Input name="name" label={t('display_name')} placeholder={t('defaults_to_file_name')} />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('file_category')}</label>
                            <select name="category" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white">
                                <option value="DOCS">{t('document_report')}</option>
                                <option value="DESIGNS">{t('design_asset')}</option>
                                <option value="BUILDS">{t('build_release')}</option>
                                <option value="OTHER">{t('other')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('visibility')}</label>
                            <select name="visibility" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white">
                                <option value="INTERNAL">{t('internal_only')}</option>
                                <option value="CLIENT">{t('shared_with_client')}</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button type="button" variant="ghost" onClick={() => { setIsModalOpen(false); setSelectedFile(null); }}>{t('cancel')}</Button>
                        <Button type="submit" variant="primary" disabled={!selectedFile || isUploading}>
                            {isUploading ? t('uploading') : t('upload')}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Document Viewer Modal */}
            {viewModal && (
                <Modal
                    isOpen={viewModal.isOpen}
                    onClose={() => setViewModal(null)}
                    title={viewModal.filename}
                    maxWidth="max-w-4xl"
                >
                    <DocumentViewer
                        url={viewModal.url}
                        filename={viewModal.filename}
                        mimeType={viewModal.mimeType}
                        onDownload={() => handleDownload(files.find(f => f.id === viewModal.fileId)!)}
                    />
                </Modal>
            )}
        </div>
    );
};
