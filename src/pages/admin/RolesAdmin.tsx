import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, RotateCcw, Save, Shield } from 'lucide-react';
import { GlassCard, Button, Badge } from '@/components/ui/UIComponents';
import { api } from '@/services/api';
import { Permission, Role, ROLE_PERMISSIONS } from '@/types';

const ALL_PERMISSIONS = Object.values(Permission);

const normalizePermissionList = (permissions: unknown): string[] => {
  if (!Array.isArray(permissions)) return [];
  return Array.from(new Set(permissions.filter((permission): permission is string => typeof permission === 'string' && permission.trim().length > 0))).sort();
};

const normalizeRolePermissions = (input: unknown): Record<Role, string[]> => {
  const output = { ...ROLE_PERMISSIONS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;

  for (const role of Object.values(Role)) {
    const candidate = (input as Record<string, unknown>)[role];
    if (candidate !== undefined) {
      output[role] = normalizePermissionList(candidate);
    }
  }

  return output;
};

const permissionLabel = (permission: string) =>
  permission
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const roleDescription = (role: Role) => {
  if (role === Role.SUPER_ADMIN) return 'Full system access and configuration.';
  if (role === Role.CLIENT_OWNER) return 'Restricted external access to owned entities.';
  if (role === Role.CLIENT_MANAGER || role === Role.CLIENT_MEMBER) return 'External client access.';
  return 'Internal operational role.';
};

export const RolesAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [roles, setRoles] = React.useState<Role[]>(Object.values(Role));
  const [rolePermissions, setRolePermissions] = React.useState<Record<Role, string[]>>({ ...ROLE_PERMISSIONS });
  const [draftPermissions, setDraftPermissions] = React.useState<Record<Role, string[]>>({ ...ROLE_PERMISSIONS });
  const [selectedRole, setSelectedRole] = React.useState<Role>(Role.SUPER_ADMIN);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [fetchedRoles, fetchedPermissions] = await Promise.all([
          api.admin.getRoles(),
          api.org.getRolePermissions(),
        ]);
        if (cancelled) return;
        const nextRoles = fetchedRoles.length > 0 ? (fetchedRoles as Role[]) : Object.values(Role);
        const normalized = normalizeRolePermissions(fetchedPermissions);
        setRoles(nextRoles);
        setRolePermissions(normalized);
        setDraftPermissions(normalized);
        const fallbackRole = nextRoles.includes(selectedRole) ? selectedRole : nextRoles[0] || Role.SUPER_ADMIN;
        setSelectedRole(fallbackRole);
      } catch (error) {
        console.error('Failed to load role permissions', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPermissions = draftPermissions[selectedRole] || [];
  const selectedRoleDefaults = ROLE_PERMISSIONS[selectedRole] || [];
  const hasChanges = React.useMemo(() => {
    const canonical = (map: Record<Role, string[]>) => JSON.stringify(normalizeRolePermissions(map));
    return canonical(draftPermissions) !== canonical(rolePermissions);
  }, [draftPermissions, rolePermissions]);

  const togglePermission = (permission: string) => {
    setDraftPermissions((current) => {
      const next = new Set(current[selectedRole] || []);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return { ...current, [selectedRole]: Array.from(next) };
    });
    setSaveMessage(null);
  };

  const resetSelectedRole = () => {
    setDraftPermissions((current) => ({ ...current, [selectedRole]: [...(ROLE_PERMISSIONS[selectedRole] || [])] }));
    setSaveMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await api.org.updateRolePermissions(draftPermissions);
      const normalized = normalizeRolePermissions(updated);
      setRolePermissions(normalized);
      setDraftPermissions(normalized);
      setSaveMessage('Role permissions saved successfully.');
    } catch (error) {
      console.error('Failed to save role permissions', error);
      setSaveMessage('Failed to save role permissions.');
    } finally {
      setSaving(false);
    }
  };

  const selectedRoleCount = selectedPermissions.length;
  const defaultCount = selectedRoleDefaults.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-white">{t('admin')} / Roles</h1>
          <p className="text-slate-400">Edit role defaults for the current organization.</p>
        </div>
        <div className="bg-[hsl(var(--brand-info)/0.1)] border border-[hsl(var(--brand-info)/0.2)] px-4 py-2 rounded-lg flex items-center gap-2 text-[hsl(var(--brand-info))] text-sm">
          <Shield className="w-4 h-4" />
          <span>Changes apply immediately after saving.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="h-fit">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-500" /> Defined Roles
          </h3>
          <div className="space-y-3">
            {roles.map((role) => {
              const count = rolePermissions[role]?.length ?? 0;
              const active = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  disabled={loading || saving}
                  className={`w-full text-left group p-3 rounded-lg border transition-colors ${active ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-700/50 bg-slate-900/30 hover:bg-slate-800/50'}`}
                >
                  <div className="flex justify-between items-center mb-1 gap-3">
                    <span className="font-medium text-slate-200">{role.replace(/_/g, ' ')}</span>
                    <Badge variant={active ? 'info' : 'neutral'} size="sm">{count} permissions</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{roleDescription(role)}</p>
                </button>
              );
            })}
          </div>
        </GlassCard>

        <div className="lg:col-span-2 space-y-6">
          <GlassCard>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedRole.replace(/_/g, ' ')}</h3>
                <p className="text-sm text-slate-500 mt-1">Toggle the permissions that should be granted by default for this role.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="info" size="sm">Selected: {selectedRoleCount}</Badge>
                  <Badge variant="neutral" size="sm">Default: {defaultCount}</Badge>
                  {hasChanges && <Badge variant="warning" size="sm">Unsaved changes</Badge>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={resetSelectedRole} disabled={loading || saving || !hasChanges}>
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Reset role
                </Button>
                <Button onClick={handleSave} disabled={loading || saving || !hasChanges}>
                  <Save className="w-4 h-4 mr-1.5" />
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL_PERMISSIONS.map((permission) => {
                const checked = selectedPermissions.includes(permission);
                return (
                  <button
                    key={permission}
                    type="button"
                    onClick={() => togglePermission(permission)}
                    disabled={loading || saving}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${checked ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/70'}`}
                  >
                    <div>
                      <p className="font-medium text-slate-100">{permissionLabel(permission)}</p>
                      <p className="text-xs text-slate-500">{permission}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${checked ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-600 text-transparent'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {saveMessage && (
              <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${saveMessage.includes('Failed') ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                {saveMessage}
              </div>
            )}
          </GlassCard>

          <GlassCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700/50">
                    <th className="p-4 font-medium text-slate-400 min-w-[150px]">Role / Capability</th>
                    {['Dashboard', 'Clients', 'Projects', 'Finance', 'Users', 'System'].map((label) => (
                      <th key={label} className="p-4 font-medium text-slate-400 text-center min-w-[80px]">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {roles.map((role) => {
                    const summaryPermissions = [
                      Permission.VIEW_DASHBOARD,
                      Permission.MANAGE_CLIENTS,
                      Permission.MANAGE_PROJECTS,
                      Permission.VIEW_FINANCIALS,
                      Permission.MANAGE_USERS,
                      Permission.VIEW_ADMIN,
                    ];
                    return (
                      <tr key={role} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-medium text-slate-300">{role.replace(/_/g, ' ')}</td>
                        {summaryPermissions.map((permission) => {
                          const active = (rolePermissions[role] || []).includes(permission);
                          return (
                            <td key={`${role}-${permission}`} className="p-4 text-center">
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
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-900/30 border-t border-slate-800">
              <p className="flex gap-2 items-center text-xs text-slate-500">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Role defaults are stored per organization. Users can still receive extra access via Admin → Users.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default RolesAdmin;
