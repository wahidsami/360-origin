
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Search, Plus, Shield,
  Mail, Edit2, Power, CheckCircle, ExternalLink, Trash2, ChevronDown, ChevronRight, RefreshCcw, Building2, Users, Link2
} from 'lucide-react';
import { GlassCard, Button, Badge, Input, Select, Label, CopyButton } from "@/components/ui/UIComponents";
import { Modal } from "@/components/ui/Modal";
import { api } from '@/services/api';
import { Role, User, Permission, Client } from '@/types';
import { useAppDialog } from '@/contexts/DialogContext';

if (!api?.users) {
  throw new Error("API client missing users namespace — check api import path.");
}

export const UsersAdmin: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { confirm } = useAppDialog();
  const isArabic = i18n.language === 'ar';
  const visiblePermissions = React.useMemo(
    () => Object.values(Permission),
    [],
  );
  const copy = React.useMemo(
    () =>
      isArabic
        ? {
            usersTitle: 'المستخدمون',
            subtitle: 'إدارة صلاحيات النظام وهويات المستخدمين.',
            addUser: 'إضافة مستخدم',
            searchPlaceholder: 'ابحث بالاسم أو البريد الإلكتروني...',
            allRoles: 'كل الأدوار',
            createIdentity: 'إنشاء هوية جديدة',
            fullName: 'الاسم الكامل',
            fullNamePlaceholder: 'مثال: محمد أحمد',
            emailAddress: 'عنوان البريد الإلكتروني',
            systemRole: 'دور النظام',
            assignedClientOrg: 'الجهة العميلة المعينة',
            selectClient: 'اختر عميلاً...',
            clientAutoAssign: 'سيتم إضافة هذا المستخدم تلقائياً كعضو في العميل المحدد.',
            customPermissions: 'الصلاحيات المخصصة، اختيارية بالإضافة إلى الدور',
            userInviteInfo: 'سيحصل المستخدمون الجدد على رابط وصول مؤقت عبر البريد الإلكتروني. يتم فرض المصادقة الثنائية افتراضياً.',
            active: 'نشط',
            inactive: 'غير نشط',
            identity: 'الهوية',
            role: 'الدور',
            status: 'الحالة',
            lastLogin: 'آخر تسجيل دخول',
            actions: 'الإجراءات',
            editRolePermissions: 'تعديل الدور والصلاحيات',
            disableAccount: 'تعطيل الحساب',
            noUsers: 'لا يوجد مستخدمون مطابقون لمعايير البحث.',
            roleDefaultsHelp: 'سيؤدي تغيير الدور إلى تحديث جميع الصلاحيات المستمدة من هذا الدور.',
            previousClientRemoved: 'سيتم إضافة المستخدم كعضو في هذا العميل، وستتم إزالة وصول العميل السابق.',
            accountActive: 'الحساب نشط',
            inactiveUsersCannotLogin: 'لا يمكن للمستخدمين غير النشطين تسجيل الدخول.',
            customPermissionsEdit: 'الصلاحيات المخصصة، بالإضافة إلى الدور الافتراضي',
            saveChanges: 'حفظ التغييرات',
            createUserFailed: 'فشل إنشاء المستخدم. حاول مرة أخرى.',
            createUserSuccess: 'تم إنشاء المستخدم بنجاح',
            inviteSent: 'تم إرسال دعوة إلى',
            userCreated: 'تم إنشاء المستخدم',
            backupInvite: 'رابط دعوة احتياطي في حال لم يصل البريد',
            inviteExpiry: 'ينتهي الرابط خلال 72 ساعة. صالح للاستخدام مرة واحدة فقط.',
            done: 'تم',
            updateFailed: 'فشل تحديث المستخدم',
            profileUpdatedSuffix: 'تم تحديث ملفه الشخصي',
          }
        : {
            usersTitle: 'Users',
            subtitle: 'Manage system access and user identities.',
            addUser: 'Add User',
            searchPlaceholder: 'Search by name or email...',
            allRoles: 'All Roles',
            createIdentity: 'Create New Identity',
            fullName: 'Full Name',
            fullNamePlaceholder: 'e.g. John Doe',
            emailAddress: 'Email Address',
            systemRole: 'System Role',
            assignedClientOrg: 'Assigned Client Organization',
            selectClient: 'Select a Client...',
            clientAutoAssign: 'This user will be automatically added as a member of the selected client.',
            customPermissions: 'Custom permissions (optional, in addition to role)',
            userInviteInfo: 'New users will receive a temporary access link via email. Two-factor authentication is enforced by default.',
            active: 'Active',
            inactive: 'Inactive',
            identity: 'Identity',
            role: 'Role',
            status: 'Status',
            lastLogin: 'Last Login',
            actions: 'Actions',
            editRolePermissions: 'Edit role & permissions',
            disableAccount: 'Disable Account',
            noUsers: 'No users found matching criteria.',
            roleDefaultsHelp: 'Changing role updates all permissions derived from that role.',
            previousClientRemoved: 'User will be added as a member of this client. Previous client access is removed.',
            accountActive: 'Account Active',
            inactiveUsersCannotLogin: 'Inactive users cannot log in.',
            customPermissionsEdit: 'Custom Permissions (in addition to role defaults)',
            saveChanges: 'Save Changes',
            createUserFailed: 'Failed to create user. Please try again.',
            createUserSuccess: 'User created successfully',
            inviteSent: 'Invite email sent to',
            userCreated: 'User Created',
            backupInvite: "Backup invite link (in case email doesn't arrive)",
            inviteExpiry: 'Link expires in 72 hours. Single-use only.',
            done: 'Done',
            updateFailed: 'Failed to update user',
            profileUpdatedSuffix: "'s profile updated",
          },
    [isArabic],
  );

  const deleteUserLabel = isArabic ? 'حذف المستخدم' : 'Delete User';
  const deleteUserConfirm = isArabic ? 'هل أنت متأكد من أنك تريد حذف هذا المستخدم؟' : 'Are you sure you want to delete this user?';
  const deleteUserFailed = isArabic ? 'فشل حذف المستخدم' : 'Failed to delete user';
  const deleteUserSuccess = isArabic ? 'تم حذف المستخدم' : 'User deleted successfully';
  const resendInviteLabel = isArabic ? 'إعادة إرسال الدعوة' : 'Resend setup email';
  const resendInviteFailed = isArabic ? 'فشل إعادة إرسال الدعوة' : 'Failed to resend setup email';
  const resendInviteSent = isArabic ? 'تمت إعادة إرسال الدعوة إلى' : 'Setup email resent to';
  const copyInviteLinkLabel = isArabic ? 'نسخ رابط الدعوة' : 'Copy invite link';
  const copyInviteLinkFailed = isArabic ? 'فشل نسخ رابط الدعوة' : 'Failed to copy invite link';
  const copyInviteLinkSuccess = isArabic ? 'تم نسخ رابط الدعوة للمستخدم' : 'Invite link copied for';
  const inviteEmailFailedLabel = isArabic ? 'تم إنشاء المستخدم لكن تعذر إرسال البريد. استخدم رابط الدعوة الاحتياطي.' : 'User created, but invite email failed. Use the backup invite link.';
  const resendEmailFailedLabel = isArabic ? 'تعذر إرسال البريد. استخدم رابط الدعوة الاحتياطي.' : 'Invite email failed. Use the backup invite link.';
  const internalUsersLabel = isArabic ? 'الفريق الداخلي' : 'Internal Team';
  const clientAccountsLabel = isArabic ? 'حسابات العميل' : 'Client Accounts';
  const invitePendingLabel = isArabic ? 'الدعوة معلقة' : 'Invite pending';
  const inviteExpiredLabel = isArabic ? 'الدعوة منتهية' : 'Invite expired';
  const setupCompleteLabel = isArabic ? 'تم إعداد الحساب' : 'Setup complete';
  const directAccessLabel = isArabic ? 'وصول مباشر' : 'Direct access';
  const noClientGroupLabel = isArabic ? 'مستخدمون بدون عميل' : 'Client users without assignment';
  const allClientsLabel = 'All Clients';
  const internalOnlyLabel = 'Internal Only';
  const filterByClientLabel = 'Filter by client';
  const clearFiltersLabel = 'Clear Filters';
  const expandAllLabel = 'Expand All';
  const collapseAllLabel = 'Collapse All';
  const filteredUsersLabel = 'filtered users';
  const visibleGroupsLabel = 'visible groups';

  const permissionLabels = React.useMemo(
    () =>
      isArabic
        ? {
            VIEW_CLIENTS: 'عرض العملاء',
            MANAGE_CLIENTS: 'إدارة العملاء',
            VIEW_DASHBOARD: 'عرض لوحة التحكم',
            VIEW_FINANCIALS: 'عرض الشؤون المالية',
            MANAGE_PROJECTS: 'إدارة المشاريع',
            MANAGE_TASKS: 'إدارة المهام',
            VIEW_ADMIN: 'عرض الإدارة',
            MANAGE_USERS: 'إدارة المستخدمين',
            MANAGE_REPORT_TEMPLATES: 'إدارة قوالب التقارير',
            MANAGE_TEAM: 'إدارة الفريق',
            ASSIGN_REPORT_TEMPLATES: 'تعيين قوالب التقارير',
            MANAGE_WORKSPACE_TEMPLATES: 'إدارة قوالب مساحة العمل',
            ASSIGN_WORKSPACE_TEMPLATES: 'تعيين قوالب مساحة العمل',
            EDIT_PROJECT_REPORTS: 'تعديل تقارير المشروع',
            CREATE_PROJECT_REPORTS: 'إنشاء تقارير المشروع',
            EDIT_PROJECT_REPORT_ENTRIES: 'تعديل عناصر تقارير المشروع',
            GENERATE_PROJECT_REPORT_EXPORTS: 'إنشاء ملفات تصدير تقارير المشروع',
            VIEW_CLIENT_REPORTS: 'عرض تقارير العملاء',
            PUBLISH_PROJECT_REPORTS: 'نشر تقارير المشروع',
          } as Record<string, string>
        : {},
    [isArabic],
  );

  const permissionLabel = React.useCallback(
    (perm: string) => permissionLabels[perm] || perm.replace(/_/g, ' '),
    [permissionLabels],
  );

  const roleLabel = React.useCallback(
    (role: string) => {
      if (!isArabic) return role.replace(/_/g, ' ');
      const labels: Record<string, string> = {
        SUPER_ADMIN: 'مدير عام',
        OPS: 'العمليات',
        PM: 'مدير مشروع',
        DEV: 'مطور',
        FINANCE: 'المالية',
        VIEWER: 'مشاهد',
        CLIENT_OWNER: 'مالك العميل',
        CLIENT_MANAGER: 'مدير العميل',
        CLIENT_MEMBER: 'عضو العميل',
      };
      return labels[role] || role.replace(/_/g, ' ');
    },
    [isArabic],
  );

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      const [usersData, clientsData] = await Promise.all([
        api.users.list(),
        api.clients.list()
      ]);
      setUsers(usersData);
      setClients(clientsData);
      setExpandedGroups((current) => {
        const next = { ...current };
        for (const user of usersData) {
          const primaryClientId = user.clientMemberships?.[0]?.clientId;
          if (primaryClientId && !(primaryClientId in next)) {
            next[primaryClientId] = false;
          }
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to load data", e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: Role.VIEWER, permissions: [] as string[], clientId: '' });
  const [inviteResult, setInviteResult] = useState<{ link: string; email: string } | null>(null);
  const [editRole, setEditRole] = useState<Role>(Role.VIEWER);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editClientId, setEditClientId] = useState('');

  const clientFilterOptions = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const filteredUsers = useMemo(() => users.filter((u) => {
    const matchSearch = (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const primaryClientId = u.clientMemberships?.[0]?.clientId || '';
    const hasClientMembership = Boolean(u.clientMemberships?.length);
    const isClientUser = u.role.startsWith('CLIENT_');

    let matchClient = true;
    if (clientFilter === 'internal') {
      matchClient = !isClientUser || !hasClientMembership;
    } else if (clientFilter === 'unassigned-client-users') {
      matchClient = isClientUser && !primaryClientId;
    } else if (clientFilter !== 'all') {
      matchClient = u.clientMemberships?.some((membership) => membership.clientId === clientFilter) || false;
    }

    return matchSearch && matchRole && matchClient;
  }), [clientFilter, roleFilter, searchTerm, users]);

  const groupedUsers = useMemo(() => {
    const groups: Array<{ key: string; label: string; type: 'internal' | 'client'; users: User[]; client?: Client | null }> = [];
    const internalUsers = filteredUsers.filter((user) => !user.clientMemberships?.length || !user.role.startsWith('CLIENT_'));

    groups.push({
      key: 'internal',
      label: internalUsersLabel,
      type: 'internal',
      users: internalUsers,
      client: null,
    });

    const clientGroups = new Map<string, { key: string; label: string; type: 'client'; users: User[]; client?: Client | null }>();

    filteredUsers.forEach((user) => {
      if (!user.role.startsWith('CLIENT_')) {
        return;
      }

      const primaryMembership = user.clientMemberships?.[0];
      const key = primaryMembership?.clientId || 'unassigned-client-users';
      const label = primaryMembership?.client?.name || noClientGroupLabel;
      const client = primaryMembership?.client || clients.find((entry) => entry.id === primaryMembership?.clientId) || null;

      if (!clientGroups.has(key)) {
        clientGroups.set(key, {
          key,
          label,
          type: 'client',
          users: [],
          client,
        });
      }

      clientGroups.get(key)!.users.push(user);
    });

    return groups.concat(Array.from(clientGroups.values()).sort((a, b) => a.label.localeCompare(b.label)));
  }, [clients, filteredUsers, internalUsersLabel, noClientGroupLabel]);

  const expandAllGroups = useCallback(() => {
    setExpandedGroups(
      groupedUsers.reduce<Record<string, boolean>>((next, group) => {
        next[group.key] = true;
        return next;
      }, {}),
    );
  }, [groupedUsers]);

  const collapseAllGroups = useCallback(() => {
    setExpandedGroups(
      groupedUsers.reduce<Record<string, boolean>>((next, group) => {
        next[group.key] = false;
        return next;
      }, {}),
    );
  }, [groupedUsers]);

  const hasActiveFilters = searchTerm.trim().length > 0 || roleFilter !== 'all' || clientFilter !== 'all';

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupKey]: !(current[groupKey] ?? false),
    }));
  };

  const openEditUser = (user: User) => {
    setEditUser(user);
    setEditRole(user.role as Role);
    setEditIsActive(user.isActive ?? true);
    setEditPermissions(user.customPermissions || []);
    setEditClientId(user.clientMemberships?.[0]?.clientId || '');
  };

  const getInviteBadge = (user: User) => {
    if (user.invitePending) {
      return { label: invitePendingLabel, variant: 'warning' as const };
    }
    if (user.inviteExpired) {
      return { label: inviteExpiredLabel, variant: 'danger' as const };
    }
    if (user.hasAcceptedInvite) {
      return { label: setupCompleteLabel, variant: 'success' as const };
    }
    return { label: directAccessLabel, variant: 'neutral' as const };
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.users.create({
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions.length ? newUser.permissions : undefined,
        clientId: newUser.role.startsWith('CLIENT_') ? newUser.clientId : undefined,
        avatar: `https://ui-avatars.com/api/?name=${newUser.name}&background=random`
      } as any);
      await loadData();
      setModalOpen(false);
      setNewUser({ name: '', email: '', role: Role.VIEWER, permissions: [], clientId: '' });

      if (created.inviteLink) {
        if (created.inviteEmailSent === false) {
          toast.error(inviteEmailFailedLabel);
        } else {
          toast.success(`${copy.inviteSent} ${newUser.email}`);
        }
        setInviteResult({ link: created.inviteLink, email: newUser.email });
      } else {
        toast.success(copy.createUserSuccess);
      }
    } catch (e) {
      console.error("Failed to create user", e);
      toast.error(copy.createUserFailed);
    }
  };

  const handleDeleteUser = async (user: User) => {
    const shouldDelete = await confirm({
      title: isArabic ? 'حذف المستخدم' : 'Delete User',
      message: deleteUserConfirm,
      confirmText: isArabic ? 'حذف' : 'Delete',
      cancelText: isArabic ? 'إلغاء' : 'Cancel',
      tone: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await api.users.delete(user.id);
      await loadData();
      if (editUser?.id === user.id) setEditUser(null);
      toast.success(deleteUserSuccess);
    } catch (e) {
      console.error('Failed to delete user', e);
      toast.error(deleteUserFailed);
    }
  };

  const handleResendInvite = async (user: User) => {
    try {
      const result = await api.users.resendInvite(user.id);
      await loadData();
      if (result.emailSent === false) {
        toast.error(resendEmailFailedLabel);
      } else {
        toast.success(`${resendInviteSent} ${user.email}`);
      }
      setInviteResult({ link: result.inviteLink, email: user.email });
    } catch (e) {
      console.error('Failed to resend invite', e);
      toast.error(resendInviteFailed);
    }
  };

  const handleCopyInviteLink = async (user: User) => {
    try {
      const result = await api.users.resendInvite(user.id);
      await navigator.clipboard.writeText(result.inviteLink);
      await loadData();
      if (result.emailSent === false) {
        toast.error(resendEmailFailedLabel);
      } else {
        toast.success(`${copyInviteLinkSuccess} ${user.email}`);
      }
    } catch (e) {
      console.error('Failed to copy invite link', e);
      toast.error(copyInviteLinkFailed);
    }
  };

  const getRoleBadgeVariant = (role: Role) => {
    if (role === Role.SUPER_ADMIN) return 'danger';
    if ([Role.PM, Role.OPS, Role.DEV].includes(role)) return 'info';
    if (role === Role.FINANCE) return 'success';
    if (role.startsWith('CLIENT')) return 'warning';
    return 'neutral';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-white">{t('admin')} / {copy.usersTitle}</h1>
          <p className="text-slate-400">{copy.subtitle}</p>
        </div>
        <Button className="shadow-[0_0_15px_rgba(6,182,212,0.4)]" onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> {copy.addUser}
        </Button>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                placeholder={copy.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full md:w-56">
              <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">{copy.allRoles}</option>
                {Object.values(Role).map(r => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </Select>
            </div>
            <div className="w-full md:w-64">
              <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                <option value="all">{filterByClientLabel}: {allClientsLabel}</option>
                <option value="internal">{internalOnlyLabel}</option>
                <option value="unassigned-client-users">{noClientGroupLabel}</option>
                {clientFilterOptions.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Badge variant="neutral" size="sm">{filteredUsers.length} {filteredUsersLabel}</Badge>
              <Badge variant="neutral" size="sm">{groupedUsers.length} {visibleGroupsLabel}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setRoleFilter('all');
                    setClientFilter('all');
                  }}
                >
                  {clearFiltersLabel}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={expandAllGroups}>
                {expandAllLabel}
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAllGroups}>
                {collapseAllLabel}
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>

      {filteredUsers.length === 0 ? (
        <GlassCard className="text-center text-slate-500">{copy.noUsers}</GlassCard>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <Building2 className="w-4 h-4" />
            <span>{clientAccountsLabel}</span>
          </div>

          {groupedUsers.map((group) => {
            const isExpanded = expandedGroups[group.key] ?? false;

            return (
              <GlassCard key={group.key} className="p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-200/60 bg-slate-50/80 px-5 py-4 text-left transition-colors hover:bg-slate-100/80 dark:border-slate-800/60 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                      {group.type === 'internal' ? <Users className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</p>
                        <Badge variant={group.type === 'internal' ? 'info' : 'warning'} size="sm">
                          {group.users.length}
                        </Badge>
                      </div>
                      {group.client && (
                        <p className="text-xs text-slate-500">{group.client.email || group.client.status}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="text-xs">{group.users.length}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                        <tr>
                          <th className="p-4 font-medium">{copy.identity}</th>
                          <th className="p-4 font-medium">{copy.role}</th>
                          <th className="p-4 font-medium">{copy.status}</th>
                          <th className="p-4 font-medium">{copy.lastLogin}</th>
                          <th className="p-4 font-medium text-right">{copy.actions}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {group.users.map((user) => {
                          const inviteBadge = getInviteBadge(user);
                          return (
                            <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                                    alt={user.name}
                                    className="w-9 h-9 rounded-full border border-slate-600 object-cover"
                                  />
                                  <div>
                                    <p className="font-medium text-slate-200">{user.name}</p>
                                    <div className="flex flex-col gap-1">
                                      <p className="text-xs text-slate-500 flex items-center gap-1">
                                        <Mail className="w-3 h-3" /> {user.email}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={inviteBadge.variant} size="sm">{inviteBadge.label}</Badge>
                                        {user.clientMemberships && user.clientMemberships.length > 1 && (
                                          <Badge variant="neutral" size="sm">+{user.clientMemberships.length - 1} more</Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] text-slate-600 font-mono">
                                        <span>ID: {user.id}</span>
                                        <CopyButton value={user.id} className="scale-75 origin-left" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-2">
                                  <Badge variant={getRoleBadgeVariant(user.role)}>
                                    {roleLabel(user.role)}
                                  </Badge>
                                  {!!user.clientMemberships?.length && (
                                    <div className="flex flex-wrap gap-1">
                                      {user.clientMemberships.map((membership) => (
                                        <Badge key={membership.id} variant="neutral" size="sm">
                                          {membership.client.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className={`w-4 h-4 ${user.isActive === false ? 'text-slate-500' : 'text-[hsl(var(--brand-success))]'}`} />
                                    <span className="text-slate-300">{user.isActive === false ? copy.inactive : copy.active}</span>
                                  </div>
                                  {user.latestInvite && (
                                    <p className="text-xs text-slate-500">
                                      {new Date(user.latestInvite.expiresAt).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-slate-400">
                                {user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : '-'}
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="sm" onClick={() => openEditUser(user)} title={copy.editRolePermissions}>
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  {!user.hasAcceptedInvite && (
                                    <>
                                      <Button variant="ghost" size="sm" title={copyInviteLinkLabel} onClick={() => handleCopyInviteLink(user)}>
                                        <Link2 className="w-4 h-4" />
                                      </Button>
                                      <Button variant="ghost" size="sm" title={resendInviteLabel} onClick={() => handleResendInvite(user)}>
                                        <RefreshCcw className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                  <Button variant="ghost" size="sm" title={copy.disableAccount} className="hover:text-rose-400">
                                    <Power className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" title={deleteUserLabel} className="hover:text-rose-400" onClick={() => handleDeleteUser(user)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Edit User Modal */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={editUser ? (isArabic ? `تعديل المستخدم: ${editUser.name}` : `Edit User: ${editUser.name}`) : ''}>
        {editUser && (
          <div className="space-y-5">

            {/* Role */}
            <div>
              <Label>{copy.systemRole}</Label>
              <Select
                value={editRole}
                onChange={(e) => { setEditRole(e.target.value as Role); setEditClientId(''); }}
                className="mt-1"
              >
                {Object.values(Role).map(r => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </Select>
              <p className="text-[10px] text-slate-500 mt-1">{copy.roleDefaultsHelp}</p>
            </div>

            {/* Client selector — only shown for CLIENT_* roles */}
            {editRole.startsWith('CLIENT_') && (
              <div className="animate-in slide-in-from-top-2 duration-200">
                <Label>{copy.assignedClientOrg}</Label>
                <Select
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  className="mt-1"
                  required
                >
                  <option value="">{copy.selectClient}</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">{copy.previousClientRemoved}</p>
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <div>
                <p className="text-sm font-medium text-slate-200">{copy.accountActive}</p>
                <p className="text-xs text-slate-500">{copy.inactiveUsersCannotLogin}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditIsActive(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editIsActive ? 'bg-cyan-600' : 'bg-slate-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  editIsActive ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Custom permissions */}
            <div>
              <Label>{copy.customPermissionsEdit}</Label>
              <div className="flex flex-wrap gap-3 mt-2 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
                {visiblePermissions.map(perm => (
                  <label key={perm} className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={editPermissions.includes(perm)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...editPermissions, perm]
                          : editPermissions.filter(p => p !== perm);
                        setEditPermissions(next);
                      }}
                      className="rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
                    />
                    {permissionLabel(perm)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editUser && !editUser.hasAcceptedInvite && (
                <>
                  <Button type="button" variant="ghost" onClick={() => handleCopyInviteLink(editUser)}>
                    <Link2 className="w-4 h-4 mr-2" />
                    {copyInviteLinkLabel}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => handleResendInvite(editUser)}>
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    {resendInviteLabel}
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={() => handleDeleteUser(editUser)}>
                <Trash2 className="w-4 h-4 mr-2" />
                {deleteUserLabel}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditUser(null)}>{t('cancel')}</Button>
              <Button type="button" onClick={async () => {
                if (!editUser) return;
                try {
                  await api.users.update(editUser.id, {
                    role: editRole,
                    isActive: editIsActive,
                    permissions: editPermissions,
                    ...(editRole.startsWith('CLIENT_') && editClientId ? { clientId: editClientId } : {}),
                  } as any);
                  await loadData();
                  setEditUser(null);
                  toast.success(isArabic ? `${editUser.name} تم تحديث ملفه الشخصي` : `${editUser.name}${copy.profileUpdatedSuffix}`);
                } catch (e) {
                  toast.error(copy.updateFailed);
                }
              }}>{copy.saveChanges}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add User Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title={copy.createIdentity}>
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <Label>{copy.fullName}</Label>
            <Input
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              required
              placeholder={copy.fullNamePlaceholder}
            />
          </div>
          <div>
            <Label>{copy.emailAddress}</Label>
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              required
              placeholder="user@nebula.com"
            />
          </div>
          <div>
            <Label>{copy.systemRole}</Label>
            <Select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
            >
              {Object.values(Role).map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </Select>
          </div>
          {newUser.role.startsWith('CLIENT_') && (
            <div className="animate-in slide-in-from-top-2 duration-300">
              <Label>{copy.assignedClientOrg}</Label>
              <Select
                value={newUser.clientId}
                onChange={(e) => setNewUser({ ...newUser, clientId: e.target.value })}
                required
              >
                <option value="">{copy.selectClient}</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <p className="text-[10px] text-slate-500 mt-1">{copy.clientAutoAssign}</p>
            </div>
          )}
          <div>
            <Label>{copy.customPermissions}</Label>
            <div className="flex flex-wrap gap-3 mt-2 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
              {visiblePermissions.map(perm => (
                <label key={perm} className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={newUser.permissions.includes(perm)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...newUser.permissions, perm]
                        : newUser.permissions.filter(p => p !== perm);
                      setNewUser({ ...newUser, permissions: next });
                    }}
                    className="rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {permissionLabel(perm)}
                </label>
              ))}
            </div>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex gap-3 items-start mt-2">
            <Shield className="w-5 h-5 text-cyan-500 shrink-0" />
            <p className="text-xs text-slate-400">
              {copy.userInviteInfo}
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button type="submit">{t('confirm')}</Button>
          </div>
        </form>
      </Modal>

      {/* Invite Success Modal */}
      <Modal isOpen={!!inviteResult} onClose={() => setInviteResult(null)} title={copy.userCreated}>
        {inviteResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-[hsl(var(--brand-success)/0.1)] border border-[hsl(var(--brand-success)/0.2)] rounded-lg">
              <CheckCircle className="w-5 h-5 text-[hsl(var(--brand-success))] shrink-0" />
              <p className="text-sm text-[hsl(var(--brand-success))]">
                {copy.inviteSent} <strong>{inviteResult.email}</strong>
              </p>
            </div>
            <div>
              <Label>{copy.backupInvite}</Label>
              <div className="flex items-center gap-2 mt-2 p-2.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <ExternalLink className="w-4 h-4 text-slate-500 shrink-0" />
                <p className="text-xs text-slate-400 truncate flex-1 font-mono">{inviteResult.link}</p>
                <CopyButton value={inviteResult.link} />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">{copy.inviteExpiry}</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setInviteResult(null)}>{copy.done}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>

  );
};

export default UsersAdmin;

