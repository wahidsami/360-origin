import React from 'react';
import { ExternalLink, KeyRound, Server, Globe } from 'lucide-react';
import { GlassCard } from '../ui/UIComponents';
import { EnvironmentAccess } from '../../types';
import { TasksTab } from './TasksTab';

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
}

export const EnvironmentsTab = ({ environments = [] }: EnvironmentsTabProps) => {
    if (!environments.length) {
        return (
            <GlassCard className="p-8 text-center">
                <Server className="w-10 h-10 mx-auto text-cyan-400 mb-3" />
                <h3 className="text-xl font-bold text-slate-300 mb-2">Environments</h3>
                <p className="text-slate-500 max-w-xl mx-auto">
                    Environment access is still being restored on the backend. Once the service is connected, this tab will list staging, QA, and production endpoints with their access details.
                </p>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-xl font-bold text-white">Environments</h3>
                    <p className="text-sm text-slate-500">Project-specific access points and credentials.</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 uppercase tracking-[0.3em]">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    Access surfaces
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {environments.map((environment) => (
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
                    </GlassCard>
                ))}
            </div>
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
