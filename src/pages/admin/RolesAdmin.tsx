
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Check, Lock, AlertTriangle, Info } from 'lucide-react';
import { GlassCard, Badge } from "@/components/ui/UIComponents";
import { Role, Permission, ROLE_PERMISSIONS } from '@/types';
import { api } from '@/services/api';

export const RolesAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [roles, setRoles] = React.useState<string[]>(Object.values(Role));

  React.useEffect(() => {
    // Verify API connection for roles
    api.admin.getRoles().then(fetchedRoles => {
      if (fetchedRoles && fetchedRoles.length > 0) {
        setRoles(fetchedRoles);
      }
    });
  }, []);

  // Categorize permissions for matrix columns
  const permissionCategories = [
    { label: 'Dashboard', perm: Permission.VIEW_DASHBOARD },
    { label: 'Clients', perm: Permission.MANAGE_CLIENTS },
    { label: 'Projects', perm: Permission.MANAGE_PROJECTS },
    { label: 'Finance', perm: Permission.VIEW_FINANCIALS },
    { label: 'Users', perm: Permission.MANAGE_USERS },
    { label: 'System', perm: Permission.VIEW_ADMIN },
  ];

  const hasPermission = (role: string, permission: Permission) => {
    return ROLE_PERMISSIONS[role as Role]?.includes(permission);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-white">{t('admin')} / Roles</h1>
          <p className="text-slate-400">Access Control Matrix and Role Definitions.</p>
        </div>
        <div className="bg-[hsl(var(--brand-warning)/0.1)] border border-[hsl(var(--brand-warning)/0.2)] px-4 py-2 rounded-lg flex items-center gap-2 text-[hsl(var(--brand-warning))] text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>Editing permissions is currently disabled in this environment.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List & Description */}
        <GlassCard className="h-fit">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-500" /> Defined Roles
          </h3>
          <div className="space-y-3">
            {roles.map(role => (
              <div key={role} className="group p-3 rounded-lg border border-slate-700/50 bg-slate-900/30 hover:bg-slate-800/50 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-slate-200">{role.replace(/_/g, ' ')}</span>
                  {role === Role.SUPER_ADMIN && <Lock className="w-3 h-3 text-rose-400" />}
                </div>
                <p className="text-xs text-slate-500">
                  {role === Role.SUPER_ADMIN ? 'Full system access and configuration.' :
                    role === Role.CLIENT_OWNER ? 'Restricted external access to owned entities.' :
                      role.includes('CLIENT') ? 'Limited external project visibility.' :
                        'Internal operational role.'}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Matrix */}
        <div className="lg:col-span-2">
          <GlassCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700/50">
                    <th className="p-4 font-medium text-slate-400 min-w-[150px]">Role / Capability</th>
                    {permissionCategories.map(cat => (
                      <th key={cat.label} className="p-4 font-medium text-slate-400 text-center min-w-[80px]">
                        {cat.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {roles.map(role => (
                    <tr key={role} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 font-medium text-slate-300">
                        {role.replace(/_/g, ' ')}
                      </td>
                      {permissionCategories.map(cat => {
                        const active = hasPermission(role, cat.perm);
                        return (
                          <td key={cat.label} className="p-4 text-center">
                            {active ? (
                              <div className="mx-auto w-6 h-6 rounded-full bg-[hsl(var(--brand-success)/0.1)] flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 text-[hsl(var(--brand-success))]" />
                              </div>
                            ) : (
                              <div className="mx-auto w-1 h-1 rounded-full bg-slate-700" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-900/30 border-t border-slate-800 space-y-2">
              <p className="flex gap-2 items-center text-xs text-slate-500">
                <Info className="w-4 h-4 shrink-0" />
                Table shows <strong className="text-slate-400">default permissions</strong> per role. Individual users can be granted extra permissions in Admin → Users (Edit → Custom permissions).
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default RolesAdmin;
