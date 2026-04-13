import { Role, Permission } from '../types';

export class PermissionsService {
    private static readonly ROLE_TABS: Record<string, string[]> = {
        [Role.SUPER_ADMIN]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings',
            'reports', 'team', 'files', 'timeline', 'sprints', 'time', 'recurring', 'financials', 'testing', 'activity'],

        [Role.OPS]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings',
            'reports', 'team', 'files', 'timeline', 'sprints', 'time', 'recurring', 'financials', 'testing', 'activity'],

        [Role.PM]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings',
            'reports', 'team', 'files', 'timeline', 'sprints', 'time', 'recurring', 'financials', 'testing', 'activity'],

        [Role.DEV]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings',
            'reports', 'team', 'files', 'timeline', 'sprints', 'time', 'recurring', 'testing', 'activity'],

        [Role.QA]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings',
            'reports', 'team', 'files', 'timeline', 'sprints', 'time', 'recurring', 'testing', 'activity'],

        [Role.FINANCE]: ['overview', 'discussions', 'milestones', 'updates', 'reports', 'team', 'files', 'financials', 'activity'],

        [Role.CLIENT_OWNER]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity'],
        [Role.CLIENT_MANAGER]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity'],
        [Role.CLIENT_MEMBER]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity'],
        [Role.VIEWER]: ['overview', 'discussions', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity']
    };

    private static readonly DEFAULT_LANDING: Record<string, string> = {
        [Role.SUPER_ADMIN]: 'overview',
        [Role.OPS]: 'overview',
        [Role.PM]: 'overview',
        [Role.DEV]: 'tasks',
        [Role.QA]: 'tasks',
        [Role.FINANCE]: 'overview',
        [Role.CLIENT_OWNER]: 'overview',
        [Role.CLIENT_MANAGER]: 'overview',
        [Role.CLIENT_MEMBER]: 'overview',
        [Role.VIEWER]: 'overview'
    };

    private static readonly READ_ONLY_TABS: Record<string, string[]> = {
        [Role.DEV]: ['overview', 'milestones', 'activity'],
        [Role.QA]: ['overview', 'milestones', 'activity'],
        [Role.FINANCE]: ['overview', 'milestones', 'updates', 'reports', 'team', 'files', 'financials', 'activity'],
        [Role.CLIENT_OWNER]: ['overview', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity'],
        [Role.CLIENT_MANAGER]: ['overview', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity'],
        [Role.CLIENT_MEMBER]: ['overview', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity'],
        [Role.VIEWER]: ['overview', 'tasks', 'milestones', 'updates', 'findings', 'reports', 'team', 'files', 'financials', 'testing', 'activity']
    };

    static getVisibleTabs(role: Role): string[] {
        return this.ROLE_TABS[role] || ['overview'];
    }

    static getDefaultLanding(role: Role): string {
        return this.DEFAULT_LANDING[role] || 'overview';
    }

    static isTabReadOnly(role: Role, tab: string): boolean {
        return this.READ_ONLY_TABS[role]?.includes(tab) || false;
    }

    static getActionPermissions(role: Role) {
        return {
            // Finding Permissions
            canCreateFinding: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.QA].includes(role),
            canUpdateFinding: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.QA].includes(role),
            canDeleteFinding: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),
            canVerifyFinding: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.QA].includes(role),
            canAssignFinding: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.QA].includes(role),

            // Task Permissions
            canCreateTask: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.DEV, Role.QA].includes(role),
            canUpdateOwnTask: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.DEV, Role.QA].includes(role),
            canUpdateAnyTask: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),
            canDeleteTask: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),
            canAssignTask: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),

            // Project Permissions
            canCreateProject: [Role.SUPER_ADMIN, Role.OPS].includes(role),
            canUpdateProject: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),
            canDeleteProject: [Role.SUPER_ADMIN, Role.OPS].includes(role),
            canManageTeam: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),

            // Financial Permissions
            canViewFinancials: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.FINANCE].includes(role),
            canManageFinancials: [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(role),

            // Client Permissions
            canViewClients: [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.DEV, Role.FINANCE, Role.CLIENT_OWNER, Role.CLIENT_MANAGER].includes(role),
            canManageClients: [Role.SUPER_ADMIN, Role.OPS].includes(role)
        };
    }

    static canViewAllProjects(role: Role): boolean {
        return [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.FINANCE].includes(role);
    }
}
