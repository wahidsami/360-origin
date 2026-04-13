import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Role } from '../types';
import { TOOLS_REGISTRY } from '../config/toolRegistry';
import { GlassCard } from '@/components/ui/UIComponents';

interface ToolsPanelProps {
  role: Role;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ role }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const accessibleTools = TOOLS_REGISTRY.filter(
    (tool) => tool.roles.includes(role),
  );

  if (accessibleTools.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-900 dark:text-white font-display uppercase tracking-widest">{t('tools')}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {accessibleTools.map(tool => (
          <GlassCard
            key={tool.id}
            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all p-5 group border-slate-200/50"
            onClick={() => navigate(tool.path)}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 shadow-sm group-hover:shadow-md transition-all group-hover:scale-110 group-hover:rotate-3">
                <tool.icon className="w-7 h-7" />
              </div>
              <span className="text-xs font-black text-slate-600 dark:text-slate-200 group-hover:text-cyan-600 dark:group-hover:text-white uppercase tracking-widest">{t(tool.titleKey)}</span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
};
