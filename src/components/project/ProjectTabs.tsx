import React, { useState } from 'react';
import { ExternalLink, KeyRound, Server, Globe, Plus, Edit, Trash2 } from 'lucide-react';
import { GlassCard, Button, Input, Modal } from '../ui/UIComponents';
import { EnvironmentAccess } from '../../types';
import { TasksTab } from './TasksTab';
import { useAppDialog } from '../../contexts/DialogContext';

// Export TasksTab directly since it exists
export { TasksTab };

// --- Placeholder Components for Missing Tabs ---
const PlaceholderTab = ({ name }: { name: string }) => (
    <GlassCard className="p-8 text-center">
        <h3 className="text-xl font-bold text-slate-300 mb-2">{name} Tab</h3>
        <p className="text-slate-500">This component is currently being restored. Please check back shortly.</p>
    </GlassCard>
);

import { OverviewTab } from './OverviewTab';
export { OverviewTab };
import { MilestonesTab } from './MilestonesTab';
export { MilestonesTab };
import { UpdatesTab } from './UpdatesTab';
export { UpdatesTab };

interface EnvironmentsTabProps {
    environments?: EnvironmentAccess[];
    canManage?: boolean;
    onUpsert?: (environment: { id?: string; name: string; url: string; username?: string | null }) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

export const EnvironmentsTab = ({ environments = [], canManage = false, onUpsert, onDelete }: EnvironmentsTabProps) => {
    const { confirm } = useAppDialog();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEnvironment, setEditingEnvironment] = useState<Partial<EnvironmentAccess> | null>(null);

    const sortedEnvironments = [...environments].sort((a, b) => a.name.localeCompare(b.name));

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEnvironment(null);
    };

    const openCreateModal = () => {
        setEditingEnvironment({});
        setIsModalOpen(true);
    };

    const handleEdit = (environment: EnvironmentAccess) => {
        setEditingEnvironment(environment);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!onDelete) return;
        const shouldDelete = await confirm({
            title: 'Delete Environment',
            message: 'Remove this environment access entry?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            tone: 'danger',
        });
        if (!shouldDelete) return;
        await onDelete(id);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!onUpsert) return;

        const formData = new FormData(event.currentTarget);
        await onUpsert({
            id: editingEnvironment?.id,
            name: String(formData.get('name') || '').trim(),
            url: String(formData.get('url') || '').trim(),
            username: String(formData.get('username') || '').trim() || null,
        });

        closeModal();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-xl font-bold text-white">Environments</h3>
                    <p className="text-sm text-slate-500">Project-specific access points and credentials.</p>
                </div>
                {canManage && onUpsert ? (
                    <Button variant="secondary" size="sm" onClick={openCreateModal}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Environment
                    </Button>
                ) : (
                    <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 uppercase tracking-[0.3em]">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        Access surfaces
                    </div>
                )}
            </div>

            {sortedEnvironments.length === 0 ? (
                <GlassCard className="p-8 text-center">
                    <Server className="w-10 h-10 mx-auto text-cyan-400 mb-3" />
                    <h3 className="text-xl font-bold text-slate-300 mb-2">Environments</h3>
                    <p className="text-slate-500 max-w-xl mx-auto">
                        Project environment access points are stored per project and can be managed here.
                    </p>
                    {canManage && onUpsert && (
                        <Button className="mt-6" onClick={openCreateModal}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Environment
                        </Button>
                    )}
                </GlassCard>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {sortedEnvironments.map((environment) => (
                        <GlassCard key={environment.id} className="p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-lg font-semibold text-slate-100">{environment.name}</h4>
                                    <p className="mt-1 text-sm text-slate-500 break-all">{environment.url}</p>
                                </div>
                                <a
                                    href={environment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-400 hover:text-cyan-300"
                                >
                                    Open
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Access</p>
                                    <p className="mt-1 text-sm text-slate-200">Environment endpoint ready</p>
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Credentials</p>
                                    <p className="mt-1 text-sm text-slate-200">
                                        {environment.credentials?.username ? (
                                            <span className="inline-flex items-center gap-2">
                                                <KeyRound className="w-4 h-4 text-cyan-400" />
                                                {environment.credentials.username}
                                            </span>
                                        ) : (
                                            'No credentials exposed'
                                        )}
                                    </p>
                                </div>
                            </div>

                            {canManage && onUpsert && onDelete && (
                                <div className="mt-4 flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleEdit(environment)}>
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(environment.id)}>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </Button>
                                </div>
                            )}
                        </GlassCard>
                    ))}
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={editingEnvironment?.id ? 'Edit Environment' : 'New Environment'}
                maxWidth="max-w-xl"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input name="name" label="Environment Name" defaultValue={editingEnvironment?.name || ''} required />
                    <Input name="url" label="URL" defaultValue={editingEnvironment?.url || ''} required />
                    <Input name="username" label="Access Username" defaultValue={editingEnvironment?.credentials?.username || ''} />
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                        <Button type="submit">Save</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

import { DiscussionsTab } from './DiscussionsTab';
export { DiscussionsTab };
import { FilesTab } from './FilesTab';
export { FilesTab };
import { TeamTab } from './TeamTab';
export { TeamTab };
import { FindingsTab } from './FindingsTab';
export { FindingsTab };
import { FinancialsTab } from './FinancialsTab';
export { FinancialsTab };
import { ReportsTab } from './ReportsTab';
export { ReportsTab };
import { TimeTab } from './TimeTab';
export { TimeTab };
import { TimelineTab } from './TimelineTab';
export { TimelineTab };
import { SprintsTab } from './SprintsTab';
export { SprintsTab };
import { ActivityTab } from './ActivityTab';
export { ActivityTab };
