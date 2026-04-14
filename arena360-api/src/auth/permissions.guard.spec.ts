import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { PermissionsGuard, ROLE_DEFAULT_PERMISSIONS } from './permissions.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const prisma = {
    org: {
      findUnique: jest.fn(),
    },
  } as any;

  const guard = new PermissionsGuard(reflector, prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createContext = (user: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any);

  it('allows access when the role default permissions satisfy the requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue(['VIEW_DASHBOARD']);

    const canActivate = await guard.canActivate(createContext({
      role: GlobalRole.FINANCE,
      orgId: 'org-1',
      customPermissions: [],
    }));

    expect(canActivate).toBe(true);
    expect(prisma.org.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { rolePermissionsJson: true },
    });
  });

  it('uses org-specific role permissions when they are configured', async () => {
    reflector.getAllAndOverride.mockReturnValue(['MANAGE_PROJECTS']);
    prisma.org.findUnique.mockResolvedValue({
      rolePermissionsJson: {
        [GlobalRole.DEV]: ['MANAGE_PROJECTS'],
      },
    });

    const canActivate = await guard.canActivate(createContext({
      role: GlobalRole.DEV,
      orgId: 'org-1',
      customPermissions: [],
    }));

    expect(canActivate).toBe(true);
    expect(ROLE_DEFAULT_PERMISSIONS[GlobalRole.DEV]).not.toContain('MANAGE_PROJECTS');
  });

  it('honors custom permissions on top of role defaults', async () => {
    reflector.getAllAndOverride.mockReturnValue(['VIEW_FINANCIALS']);
    prisma.org.findUnique.mockResolvedValue({
      rolePermissionsJson: {
        [GlobalRole.CLIENT_MEMBER]: ['VIEW_DASHBOARD'],
      },
    });

    const canActivate = await guard.canActivate(createContext({
      role: GlobalRole.CLIENT_MEMBER,
      orgId: 'org-1',
      customPermissions: ['VIEW_FINANCIALS'],
    }));

    expect(canActivate).toBe(true);
  });

  it('blocks access when the user has no matching permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['MANAGE_USERS']);
    prisma.org.findUnique.mockResolvedValue({
      rolePermissionsJson: {
        [GlobalRole.CLIENT_MEMBER]: ['VIEW_DASHBOARD'],
      },
    });

    const canActivate = await guard.canActivate(createContext({
      role: GlobalRole.CLIENT_MEMBER,
      orgId: 'org-1',
      customPermissions: [],
    }));

    expect(canActivate).toBe(false);
  });

  it('skips permission checks when no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    const canActivate = await guard.canActivate(createContext({
      role: GlobalRole.CLIENT_MEMBER,
      orgId: 'org-1',
      customPermissions: [],
    }));

    expect(canActivate).toBe(true);
    expect(prisma.org.findUnique).not.toHaveBeenCalled();
  });
});
