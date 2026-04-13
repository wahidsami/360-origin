import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

export const ROLE_DEFAULT_PERMISSIONS: Record<GlobalRole, string[]> = {
  [GlobalRole.SUPER_ADMIN]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'MANAGE_CLIENTS', 'MANAGE_PROJECTS', 'MANAGE_TASKS', 'MANAGE_TEAM', 'VIEW_FINANCIALS', 'MANAGE_USERS', 'VIEW_ADMIN', 'MANAGE_REPORT_TEMPLATES', 'ASSIGN_REPORT_TEMPLATES', 'MANAGE_WORKSPACE_TEMPLATES', 'ASSIGN_WORKSPACE_TEMPLATES', 'CREATE_PROJECT_REPORTS', 'EDIT_PROJECT_REPORTS', 'EDIT_PROJECT_REPORT_ENTRIES', 'GENERATE_PROJECT_REPORT_EXPORTS', 'PUBLISH_PROJECT_REPORTS', 'VIEW_CLIENT_REPORTS'],
  [GlobalRole.OPS]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'MANAGE_CLIENTS', 'MANAGE_PROJECTS', 'MANAGE_TASKS', 'MANAGE_TEAM', 'VIEW_FINANCIALS', 'MANAGE_WORKSPACE_TEMPLATES', 'ASSIGN_WORKSPACE_TEMPLATES'],
  [GlobalRole.PM]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'MANAGE_PROJECTS', 'MANAGE_TASKS', 'MANAGE_TEAM', 'CREATE_PROJECT_REPORTS', 'EDIT_PROJECT_REPORTS', 'EDIT_PROJECT_REPORT_ENTRIES', 'GENERATE_PROJECT_REPORT_EXPORTS', 'PUBLISH_PROJECT_REPORTS'],
  [GlobalRole.DEV]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'MANAGE_TASKS', 'CREATE_PROJECT_REPORTS', 'EDIT_PROJECT_REPORTS', 'EDIT_PROJECT_REPORT_ENTRIES'],
  [GlobalRole.QA]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'MANAGE_TASKS', 'CREATE_PROJECT_REPORTS', 'EDIT_PROJECT_REPORTS', 'EDIT_PROJECT_REPORT_ENTRIES', 'GENERATE_PROJECT_REPORT_EXPORTS'],
  [GlobalRole.FINANCE]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'VIEW_FINANCIALS'],
  [GlobalRole.CLIENT_OWNER]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'VIEW_FINANCIALS', 'VIEW_CLIENT_REPORTS'],
  [GlobalRole.CLIENT_MANAGER]: ['VIEW_DASHBOARD', 'VIEW_CLIENTS', 'VIEW_CLIENT_REPORTS'],
  [GlobalRole.CLIENT_MEMBER]: ['VIEW_DASHBOARD', 'VIEW_CLIENT_REPORTS'],
  [GlobalRole.VIEWER]: ['VIEW_DASHBOARD'],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) { }

  private normalizePermissionList(permissions: unknown): string[] {
    if (!Array.isArray(permissions)) return [];
    return Array.from(new Set(permissions.filter((permission): permission is string => typeof permission === 'string' && permission.trim().length > 0))).sort();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (!user.orgId) return false;

    if (user.role === GlobalRole.SUPER_ADMIN) return true;

    const org = await this.prisma.org.findUnique({
      where: { id: user.orgId },
      select: { rolePermissionsJson: true },
    });
    const orgRolePermissions = org?.rolePermissionsJson && typeof org.rolePermissionsJson === 'object' && !Array.isArray(org.rolePermissionsJson)
      ? (org.rolePermissionsJson as Record<string, unknown>)
      : null;
    const rolePerms = orgRolePermissions?.[user.role as GlobalRole]
      ? this.normalizePermissionList(orgRolePermissions[user.role as GlobalRole])
      : ROLE_DEFAULT_PERMISSIONS[user.role as GlobalRole] ?? [];
    const customPerms = Array.isArray(user.customPermissions) ? user.customPermissions : [];

    const has = (perm: string) =>
      rolePerms.includes(perm) || customPerms.includes(perm);

    return requiredPermissions.some((p) => has(p));
  }
}
