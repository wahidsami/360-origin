import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Folder, Mail, Phone, Globe, MapPin, UserPlus, Upload, FileText, CheckCircle, Clock, Eye, Download } from 'lucide-react';
import { Client, Project, ClientMember, FileAsset, ActivityLog, Role, Permission } from '../types';
import { api } from '../services/api';
import { GlassCard, Button, Badge, KpiCard, Input, Label, Select } from '../components/ui/UIComponents';
import { PermissionGate } from '../components/PermissionGate';
import { Modal } from '../components/ui/Modal';
import { DocumentViewer } from '../components/DocumentViewer';
import { CustomFieldsSection } from '../components/CustomFieldsSection';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../contexts/DialogContext';
import { navigateBack } from '@/utils/navigation';
import { formatCurrency } from '@/utils/currency';

export const ClientDetails: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { clientId } = useParams();
    const navigate = useNavigate();
    const { can, user } = useAuth();
    const { confirm } = useAppDialog();
    const isClientPortalUser = !!user && user.role.startsWith('CLIENT_');
    const isArabic = i18n.language === 'ar';
    const locale = isArabic ? 'ar-SA' : 'en-US';

    const copy = React.useMemo(() => ({
        loadingClientData: isArabic ? 'جارٍ تحميل بيانات العميل...' : 'Loading client data...',
        clientNotFound: isArabic ? 'لم يتم العثور على العميل.' : 'Client not found.',
        noAddress: isArabic ? 'لا يوجد عنوان' : 'No Address',
        notAvailable: isArabic ? 'غير متوفر' : 'N/A',
        editProfile: isArabic ? 'تعديل الملف' : 'Edit Profile',
        atAGlance: isArabic ? 'لمحة سريعة' : 'At a Glance',
        activeProjects: isArabic ? 'المشاريع النشطة' : 'Active Projects',
        activeEngagements: isArabic ? 'المشاريع النشطة' : 'Active Engagements',
        unnamedProject: isArabic ? 'مشروع بدون اسم' : 'Unnamed Project',
        deadline: isArabic ? 'الموعد النهائي' : 'Deadline',
        tbd: isArabic ? 'لاحقاً' : 'TBD',
        complete: isArabic ? 'مكتمل' : 'Complete',
        teamAccess: isArabic ? 'وصول الفريق' : 'Team Access',
        assetsAndContracts: isArabic ? 'الأصول والعقود' : 'Assets & Contracts',
        remove: isArabic ? 'إزالة' : 'Remove',
        by: isArabic ? 'بواسطة' : 'by',
        file: isArabic ? 'ملف' : 'File',
        selectUserPlaceholder: isArabic ? '-- اختر المستخدم --' : '-- Select User --',
    }), [isArabic]);

    const formatRoleLabel = React.useCallback((role: string) => {
        if (!isArabic) return role.replace(/_/g, ' ');
        const labels: Record<string, string> = {
            SUPER_ADMIN: 'مدير عام',
            OPS: 'العمليات',
            PM: 'مدير مشروع',
            DEV: 'مطور',
            QA: 'اختبار الجودة',
            FINANCE: 'المالية',
            CLIENT_OWNER: 'مالك العميل',
            CLIENT_MANAGER: 'مدير العميل',
            CLIENT_MEMBER: 'عضو العميل',
            VIEWER: 'مشاهد',
        };
        return labels[role] || role.replace(/_/g, ' ');
    }, [isArabic]);

    const formatHealthLabel = React.useCallback((health?: string | null) => {
        const normalized = (health || 'unknown').toLowerCase();
        if (!isArabic) return normalized.toUpperCase();
        const labels: Record<string, string> = {
            good: 'جيد',
            'at-risk': 'معرّض للخطر',
            critical: 'حرج',
            unknown: 'غير معروف',
        };
        return labels[normalized] || normalized;
    }, [isArabic]);

    const formatClientStatusLabel = React.useCallback((status?: string | null) => {
        const normalized = (status || '').toLowerCase();
        if (!isArabic) return normalized.toUpperCase();
        const labels: Record<string, string> = {
            active: 'نشط',
            inactive: 'غير نشط',
            archived: 'مؤرشف',
        };
        return labels[normalized] || normalized;
    }, [isArabic]);

    const [client, setClient] = useState<Client | undefined>();
    const [projects, setProjects] = useState<Project[]>([]);
    const [members, setMembers] = useState<ClientMember[]>([]);
    const [files, setFiles] = useState<FileAsset[]>([]);
    const [activity, setActivity] = useState<ActivityLog[]>([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isMemberModalOpen, setMemberModalOpen] = useState(false);
    const [isFileModalOpen, setFileModalOpen] = useState(false);
    const [viewModal, setViewModal] = useState<{ isOpen: boolean; url: string; filename: string; mimeType: string; fileId: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleGoBack = () => navigateBack(navigate, '/app/clients');

    // Form States
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedRole, setSelectedRole] = useState(Role.CLIENT_MEMBER);
    const [fileData, setFileData] = useState({ name: '', category: 'other' as any });

    useEffect(() => {
        let isCurrent = true;

        if (clientId) {
            setLoading(true);
            setClient(undefined);
            setProjects([]);
            setMembers([]);
            setFiles([]);
            setActivity([]);
            loadData(clientId, () => isCurrent);
        }

        return () => {
            isCurrent = false;
        };
    }, [clientId]);

    const loadData = async (
        requestedClientId: string | undefined = clientId,
        isCurrent: () => boolean = () => true
    ) => {
        if (!requestedClientId) {
            setLoading(false);
            return;
        }

        const c = await api.clients.get(requestedClientId);
        if (!isCurrent()) return;
        setClient(c);

        if (!c) {
            setLoading(false);
            return;
        }

        const [p, m, f, a] = await Promise.allSettled([
            api.projects.getByClient(requestedClientId),
            api.clients.getMembers(requestedClientId),
            api.clients.getFiles(requestedClientId),
            isClientPortalUser ? Promise.resolve([]) : api.clients.getActivity(requestedClientId),
        ]);

        if (!isCurrent()) return;
        setProjects(p.status === 'fulfilled' ? p.value : []);
        setMembers(m.status === 'fulfilled' ? m.value : []);
        setFiles(f.status === 'fulfilled' ? f.value : []);
        setActivity(a.status === 'fulfilled' ? a.value : []);
        setLoading(false);
    };

    const [availableUsers, setAvailableUsers] = useState<any[]>([]);

    useEffect(() => {
        if (isMemberModalOpen) {
            api.users.list().then(setAvailableUsers).catch(console.error);
        }
    }, [isMemberModalOpen]);

    const handleFileAction = async (fileId: string, download: boolean = true) => {
        if (!clientId) return;
        try {
            const file = files.find(f => f.id === fileId);
            const url = await api.clients.downloadFile(clientId, fileId, download);
            if (url) {
                if (download) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = '';
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else if (file) {
                    setViewModal({
                        isOpen: true,
                        url,
                        filename: file.name,
                        mimeType: file.mimeType || 'application/octet-stream',
                        fileId: file.id
                    });
                }
            }
        } catch (err) {
            console.error('File action failed', err);
        }
    };

    const handleInviteMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientId || !selectedUserId) return;
        setIsSubmitting(true);
        try {
            await api.clients.addMember(clientId, selectedUserId, selectedRole);
            setMemberModalOpen(false);
            loadData(); // Refresh data
        } catch (e) {
            console.error("Failed to add member", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!clientId) return;
        const shouldRemove = await confirm({
            title: t('remove_member') || 'Remove member',
            message: t('confirm_remove_member'),
            confirmText: t('remove') || 'Remove',
            tone: 'danger',
        });
        if (!shouldRemove) return;
        try {
            await api.clients.removeMember(clientId, userId);
            loadData();
        } catch (e) {
            console.error("Failed to remove member", e);
        }
    };

    const handleUploadFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientId || !fileData.name) return;
        setIsSubmitting(true);
        try {
            const formData = e.target as any;
            const fileInput = formData.querySelector('input[type="file"]');
            const file = fileInput?.files?.[0];

            if (file) {
                await api.clients.uploadFile(clientId, file, fileData.category);
            }
            setFileModalOpen(false);
            loadData(); // Refresh data
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="p-10 text-center text-slate-500">{copy.loadingClientData}</div>;
    if (!client) return <div className="p-10 text-center text-slate-500">{copy.clientNotFound}</div>;
    const activeProjectsCount = projects.filter(p => p.status === 'in_progress').length;
    const totalProjectBudget = projects.reduce((sum, project) => sum + (project.budget || 0), 0);

    const tabs = [
        { id: 'overview', label: t('overview') },
        { id: 'projects', label: t('projects') },
        { id: 'members', label: t('members') },
        { id: 'files', label: t('files') },
        ...(!isClientPortalUser ? [{ id: 'activity', label: t('activity') }] : []),
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={handleGoBack}><ArrowLeft className="w-5 h-5" /></Button>
                    <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-xl">
                        {client.logoUrl ? (
                            <img
                                src={client.logoUrl}
                                alt={client.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-3xl font-bold text-slate-500">${client.name.charAt(0)}</div>`;
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-slate-500">
                                {client.name.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-display text-white">{client.name}</h1>
                        <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {client.address || copy.noAddress}</span>
                            <span className="w-1 h-1 bg-slate-600 rounded-full" />
                            <span>{client.industry}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant={client.status === 'active' ? 'success' : 'neutral'}>{formatClientStatusLabel(client.status)}</Badge>
                    <PermissionGate permission={Permission.MANAGE_CLIENTS}>
                        <Button variant="secondary" size="sm" onClick={() => navigate('edit')}>{copy.editProfile}</Button>
                    </PermissionGate>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700/50 overflow-x-auto scrollbar-none gap-8">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`pb-4 px-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'text-cyan-400 border-cyan-400' : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="min-h-[400px]">

                {/* OVERVIEW */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="space-y-6">
                            <GlassCard title={copy.atAGlance} className="h-fit">
                                <dl className="space-y-4 text-sm">
                                    <div className="flex items-center gap-3 text-slate-300">
                                        <Mail className="w-4 h-4 text-cyan-500" /> {client.email}
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-300">
                                        <Phone className="w-4 h-4 text-cyan-500" /> {client.phone || copy.notAvailable}
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-300">
                                        <Globe className="w-4 h-4 text-cyan-500" /> {client.website || copy.notAvailable}
                                    </div>
                                </dl>
                            </GlassCard>

                            <GlassCard className="h-fit">
                                <CustomFieldsSection entityType="CLIENT" entityId={client.id} />
                            </GlassCard>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <KpiCard label={copy.activeProjects} value={activeProjectsCount} trend={0} />
                                <KpiCard label={t('outstanding_balance')} value={formatCurrency(client.outstandingBalance || 0, client.billing?.currency || 'SAR')} />
                                <KpiCard label={t('revenue')} value={formatCurrency(client.revenueYTD || 0, client.billing?.currency || 'SAR')} />
                                <KpiCard label={t('budget_total')} value={formatCurrency(totalProjectBudget, client.billing?.currency || 'SAR')} />
                            </div>

                            {!isClientPortalUser && (
                                <GlassCard title={t('recent_activity')}>
                                    <div className="space-y-4">
                                        {activity.slice(0, 3).map(act => (
                                            <div key={act.id} className="flex gap-4 items-start">
                                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs border border-slate-700">
                                                    {act.userName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm text-slate-200">{act.description}</p>
                                                    <p className="text-xs text-slate-500">{new Date(act.timestamp).toLocaleString(locale)}</p>
                                                </div>
                                            </div>
                                        ))}
                                        {activity.length === 0 && <p className="text-slate-500 text-sm italic">{t('no_activity')}</p>}
                                    </div>
                                </GlassCard>
                            )}
                        </div>
                    </div>
                )}

                {/* PROJECTS */}
                {activeTab === 'projects' && (
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <h3 className="text-lg font-semibold text-white">{copy.activeEngagements}</h3>
                            <PermissionGate permission={Permission.MANAGE_PROJECTS}>
                                <Button size="sm" onClick={() => navigate(`/app/projects/new?clientId=${client.id}`)}>
                                    <Folder className="w-4 h-4 mr-2" /> {t('new_project')}
                                </Button>
                            </PermissionGate>
                        </div>
                        <div className="grid gap-4">
                            {projects.map(p => (
                                <GlassCard key={p.id} className="hover:border-cyan-500/30 cursor-pointer transition-all" onClick={() => navigate(`/app/projects/${p.id}`)}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-cyan-900/20 rounded-lg text-cyan-400">
                                                <Folder />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-slate-100">{p.name || copy.unnamedProject}</h4>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                    <span>{copy.deadline}: {p.deadline || copy.tbd}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant={p.health === 'good' ? 'success' : p.health === 'at-risk' ? 'warning' : p.health === 'critical' ? 'danger' : 'neutral'}>
                                                {formatHealthLabel(p.health)}
                                            </Badge>
                                            <p className="text-xs text-slate-500 mt-2">{p.progress || 0}% {copy.complete}</p>
                                        </div>
                                    </div>
                                </GlassCard>
                            ))}
                            {projects.length === 0 && <div className="p-8 text-center text-slate-500 bg-slate-900/30 rounded-xl">{t('no_projects_found')}</div>}
                        </div>
                    </div>
                )}

                {/* MEMBERS */}
                {activeTab === 'members' && (
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <h3 className="text-lg font-semibold text-white">{copy.teamAccess}</h3>
                            <PermissionGate permission={Permission.MANAGE_CLIENTS}>
                                <Button size="sm" onClick={() => setMemberModalOpen(true)}>
                                    <UserPlus className="w-4 h-4 mr-2" /> {t('add_member')}
                                </Button>
                            </PermissionGate>
                        </div>
                        <GlassCard>
                            <table className="w-full text-left">
                                <thead className="text-slate-500 text-sm border-b border-slate-700/50">
                                    <tr>
                                        <th className="pb-3 pl-2">{t('name')}</th>
                                        <th className="pb-3">{t('role')}</th>
                                        <th className="pb-3">{t('joined')}</th>
                                        <th className="pb-3 text-right">{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {members.map(m => (
                                        <tr key={m.id}>
                                            <td className="py-4 pl-2 font-medium text-slate-200">{m.name}</td>
                                            <td className="py-4"><Badge variant="neutral">{formatRoleLabel(m.role)}</Badge></td>
                                            <td className="py-4 text-slate-400 text-sm">{new Date(m.joinedAt).toLocaleDateString(locale)}</td>
                                            <td className="py-4 text-right">
                                                <PermissionGate permission={Permission.MANAGE_CLIENTS}>
                                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m.userId)}>{copy.remove}</Button>
                                                </PermissionGate>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </GlassCard>
                    </div>
                )}

                {/* FILES */}
                {activeTab === 'files' && (
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <h3 className="text-lg font-semibold text-white">{copy.assetsAndContracts}</h3>
                            <Button size="sm" onClick={() => setFileModalOpen(true)}>
                                <Upload className="w-4 h-4 mr-2" /> {t('upload_file')}
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {files.map(f => (
                                <GlassCard key={f.id} className="group hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-2 bg-slate-800 rounded text-cyan-400">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="sm" className="p-1 h-7 w-7 text-slate-500 hover:text-white" onClick={() => handleFileAction(f.id, false)}>
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" className="p-1 h-7 w-7 text-slate-500 hover:text-white" onClick={() => handleFileAction(f.id, true)}>
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <h4 className="font-medium text-slate-200 truncate" title={f.name}>{f.name}</h4>
                                    <div className="flex justify-between items-center mt-4 text-xs text-slate-500">
                                        <span className="capitalize bg-slate-800 px-2 py-0.5 rounded">{f.category}</span>
                                        <span>{new Date(f.uploadedAt).toLocaleDateString(locale)}</span>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                        {files.length === 0 && <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">{t('no_files')}</div>}
                    </div>
                )}

                {/* ACTIVITY */}
                {activeTab === 'activity' && (
                    <GlassCard>
                        <div className="space-y-8 pl-4 border-l border-slate-700/50 relative">
                            {activity.map(act => (
                                <div key={act.id} className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-cyan-900 border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <span className="text-sm font-medium text-slate-200">{act.description}</span>
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {new Date(act.timestamp).toLocaleString(locale)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">{copy.by} <span className="text-cyan-400">{act.userName}</span></p>
                                </div>
                            ))}
                            {activity.length === 0 && <p className="text-slate-500 text-sm italic">{t('no_activity')}</p>}
                        </div>
                    </GlassCard>
                )}
            </div>

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
                        onDownload={() => handleFileAction(viewModal.fileId, true)}
                    />
                </Modal>
            )}

            {/* Add Member Modal */}
            <Modal isOpen={isMemberModalOpen} onClose={() => setMemberModalOpen(false)} title={t('add_member')}>
                <form onSubmit={handleInviteMember} className="space-y-4">
                    <div>
                        <Label>{t('select_user')}</Label>
                        <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} required>
                            <option value="">{copy.selectUserPlaceholder}</option>
                            {availableUsers.map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <Label>{t('select_role')}</Label>
                        <Select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as Role)}>
                            {Object.values(Role).map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="ghost" onClick={() => setMemberModalOpen(false)}>{t('cancel')}</Button>
                        <Button type="submit" disabled={isSubmitting}>{t('invite')}</Button>
                    </div>
                </form>
            </Modal>

            {/* Upload File Modal */}
            <Modal isOpen={isFileModalOpen} onClose={() => setFileModalOpen(false)} title={t('upload_file')}>
                <form onSubmit={handleUploadFile} className="space-y-4">
                    <div>
                        <Label>{t('file_name')}</Label>
                        <Input value={fileData.name} onChange={(e) => setFileData({ ...fileData, name: e.target.value })} placeholder="e.g. Q1_Report.pdf" required />
                    </div>
                    <div>
                        <Label>{copy.file}</Label>
                        <Input type="file" required />
                    </div>
                    <div>
                        <Label>{t('file_category')}</Label>
                        <Select value={fileData.category} onChange={(e) => setFileData({ ...fileData, category: e.target.value as any })}>
                            <option value="brief">{t('brief')}</option>
                            <option value="contract">{t('contract')}</option>
                            <option value="invoice">{t('invoice')}</option>
                            <option value="other">{t('other')}</option>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="ghost" onClick={() => setFileModalOpen(false)}>{t('cancel')}</Button>
                        <Button type="submit" disabled={isSubmitting}>{t('upload')}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
