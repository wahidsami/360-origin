import React from 'react';
import { GlassCard, Button } from '../ui/UIComponents';
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
export const EnvironmentsTab = (props: any) => <PlaceholderTab name="Environments" />;
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
