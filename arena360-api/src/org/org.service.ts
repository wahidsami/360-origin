import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { GlobalRole, SSOProvider } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

export interface CreateOrgDto {
  name: string;
  slug: string;
  plan?: string;
  maxUsers?: number;
  maxProjects?: number;
  maxStorageMB?: number;
}

const DEFAULT_ROLE_PERMISSIONS: Record<GlobalRole, string[]> = {
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

const DEFAULT_ORG_BRANDING = {
  logo: null,
  primaryColor: '#06b6d4',
  accentColor: '#6366f1',
};

const normalizePermissionList = (permissions: unknown): string[] => {
  if (!Array.isArray(permissions)) return [];
  return Array.from(new Set(permissions.filter((permission): permission is string => typeof permission === 'string' && permission.trim().length > 0))).sort();
};

const normalizeRolePermissions = (input: unknown): Record<GlobalRole, string[]> => {
  const output = { ...DEFAULT_ROLE_PERMISSIONS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return output;
  }

  for (const role of Object.values(GlobalRole)) {
    const candidate = (input as Record<string, unknown>)[role];
    if (candidate !== undefined) {
      output[role] = normalizePermissionList(candidate);
    }
  }

  return output;
};

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  getDefaultRolePermissions() {
    return normalizeRolePermissions(DEFAULT_ROLE_PERMISSIONS);
  }

  getFallbackOrg(orgId: string) {
    return {
      id: orgId,
      name: 'Arena360',
      slug: 'arena360',
      createdAt: new Date(),
      plan: 'FREE',
      maxUsers: 50,
      maxProjects: 100,
      maxStorageMB: 5000,
      trialEndsAt: null,
      ...DEFAULT_ORG_BRANDING,
      rolePermissionsJson: this.getDefaultRolePermissions(),
      onboardingDismissedAt: null,
    };
  }

  async resolveOrgId(user: { orgId?: string | null; id?: string; sub?: string } | null | undefined): Promise<string> {
    if (user?.orgId) {
      return user.orgId;
    }

    const userId = user?.id ?? user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Organization context missing');
    }

    const resolved = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    if (!resolved?.orgId) {
      throw new UnauthorizedException('Organization context missing');
    }

    return resolved.orgId;
  }

  async createOrg(dto: CreateOrgDto) {
    const slug = dto.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'org';
    const existing = await this.prisma.org.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Organization slug already in use');
    return this.prisma.org.create({
      data: {
        name: dto.name.trim(),
        slug,
        plan: dto.plan ?? 'FREE',
        maxUsers: dto.maxUsers ?? 50,
        maxProjects: dto.maxProjects ?? 100,
        maxStorageMB: dto.maxStorageMB ?? 5000,
      },
    });
  }

  async getOrg(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrg(orgId: string, data: { name?: string; slug?: string; plan?: string; logo?: string; primaryColor?: string; accentColor?: string; maxUsers?: number; maxProjects?: number; maxStorageMB?: number }) {
    await this.getOrg(orgId);
    return this.prisma.org.update({
      where: { id: orgId },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.slug != null && { slug: data.slug }),
        ...(data.plan != null && { plan: data.plan }),
        ...(data.logo != null && { logo: data.logo }),
        ...(data.primaryColor != null && { primaryColor: data.primaryColor }),
        ...(data.accentColor != null && { accentColor: data.accentColor }),
        ...(data.maxUsers != null && { maxUsers: data.maxUsers }),
        ...(data.maxProjects != null && { maxProjects: data.maxProjects }),
        ...(data.maxStorageMB != null && { maxStorageMB: data.maxStorageMB }),
      },
    });
  }

  async getRolePermissions(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, rolePermissionsJson: true },
    });
    if (!org) return this.getDefaultRolePermissions();
    return normalizeRolePermissions(org.rolePermissionsJson);
  }

  async updateRolePermissions(orgId: string, rolePermissions: Record<string, unknown>) {
    await this.getOrg(orgId);
    const normalized = normalizeRolePermissions(rolePermissions);
    await this.prisma.org.update({
      where: { id: orgId },
      data: { rolePermissionsJson: normalized },
    });
    return normalized;
  }

  async getUsage(orgId: string) {
    try {
      await this.getOrg(orgId);
    } catch {
      return {
        users: 0,
        projects: 0,
        storageUsedBytes: 0,
        storageUsedMB: 0,
      };
    }
    const [userCount, projectCount] = await Promise.all([
      this.prisma.user.count({ where: { orgId } }),
      this.prisma.project.count({ where: { orgId, deletedAt: null } }),
    ]);
    const fileAssets = await this.prisma.fileAsset.findMany({
      where: { orgId },
      select: { sizeBytes: true },
    });
    const storageUsedBytes = fileAssets.reduce((sum, f) => sum + f.sizeBytes, 0);
    return {
      users: userCount,
      projects: projectCount,
      storageUsedBytes,
      storageUsedMB: Math.round(storageUsedBytes / (1024 * 1024) * 100) / 100,
    };
  }

  async getSsoConfigs(orgId: string) {
    await this.getOrg(orgId);
    const list = await this.prisma.sSOConfig.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((c) => ({
      id: c.id,
      provider: c.provider,
      name: c.name,
      enabled: c.enabled,
      clientId: c.clientId,
      clientSecret: c.clientSecret ? '••••••••' : null,
      issuer: c.issuer,
      entryPoint: c.entryPoint,
      cert: c.cert ? '(set)' : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createSsoConfig(
    orgId: string,
    data: {
      provider: SSOProvider;
      name: string;
      enabled?: boolean;
      clientId?: string;
      clientSecret?: string;
      issuer?: string;
      entryPoint?: string;
      cert?: string;
    },
  ) {
    await this.getOrg(orgId);
    return this.prisma.sSOConfig.create({
      data: {
        orgId,
        provider: data.provider,
        name: data.name,
        enabled: data.enabled ?? true,
        clientId: data.clientId ?? null,
        clientSecret: data.clientSecret ?? null,
        issuer: data.issuer ?? null,
        entryPoint: data.entryPoint ?? null,
        cert: data.cert ?? null,
      },
    });
  }

  async updateSsoConfig(
    orgId: string,
    id: string,
    data: {
      name?: string;
      enabled?: boolean;
      clientId?: string;
      clientSecret?: string;
      issuer?: string;
      entryPoint?: string;
      cert?: string;
    },
  ) {
    await this.getOrg(orgId);
    const existing = await this.prisma.sSOConfig.findFirst({
      where: { id, orgId },
    });
    if (!existing) throw new NotFoundException('SSO config not found');
    const update: Record<string, unknown> = {};
    if (data.name != null) update.name = data.name;
    if (data.enabled != null) update.enabled = data.enabled;
    if (data.clientId != null) update.clientId = data.clientId;
    if (data.clientSecret != null) update.clientSecret = data.clientSecret;
    if (data.issuer != null) update.issuer = data.issuer;
    if (data.entryPoint != null) update.entryPoint = data.entryPoint;
    if (data.cert != null) update.cert = data.cert;
    return this.prisma.sSOConfig.update({
      where: { id },
      data: update,
    });
  }

  async deleteSsoConfig(orgId: string, id: string) {
    await this.getOrg(orgId);
    const existing = await this.prisma.sSOConfig.findFirst({
      where: { id, orgId },
    });
    if (!existing) throw new NotFoundException('SSO config not found');
    return this.prisma.sSOConfig.delete({ where: { id } });
  }

  async getOnboardingStatus(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        slug: true,
        onboardingDismissedAt: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const [projectCount, userCount, inviteCount] = await Promise.all([
      this.prisma.project.count({ where: { orgId, deletedAt: null } }),
      this.prisma.user.count({ where: { orgId } }),
      this.prisma.userInvite.count({ where: { user: { orgId } } }),
    ]);
    const steps = {
      profile: !!(org.slug && org.name?.trim()),
      firstProject: projectCount >= 1,
      inviteMember: userCount >= 2 || inviteCount >= 1,
    };
    const completed =
      !!org.onboardingDismissedAt || (steps.profile && steps.firstProject && steps.inviteMember);
    return { completed, steps };
  }

  async dismissOnboarding(orgId: string) {
    await this.getOrg(orgId);
    return this.prisma.org.update({
      where: { id: orgId },
      data: { onboardingDismissedAt: new Date() },
      select: { id: true, onboardingDismissedAt: true },
    });
  }

  /** Public: branding and SSO availability for login page (no auth). */
  async getPublicOrgBySlug(slug: string) {
    const org = await this.prisma.org.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, name: true, slug: true, logo: true, primaryColor: true, accentColor: true },
    });
    if (!org) return null;
    const configs = await this.prisma.sSOConfig.findMany({
      where: { orgId: org.id, enabled: true },
      select: { provider: true },
    });
    const sso = {
      saml: configs.some((c) => c.provider === SSOProvider.SAML),
      google: configs.some((c) => c.provider === SSOProvider.GOOGLE),
    };
    return {
      name: org.name,
      logo: org.logo,
      primaryColor: org.primaryColor,
      accentColor: org.accentColor,
      slug: org.slug,
      sso,
    };
  }
}
