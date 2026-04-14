import { NotFoundException } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { OrgService } from './org.service';

describe('OrgService role permissions', () => {
  const prisma = {
    org: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const service = new OrgService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns normalized defaults when no org role permissions are stored', async () => {
    prisma.org.findUnique.mockResolvedValue({
      id: 'org-1',
      rolePermissionsJson: null,
    });

    const permissions = await service.getRolePermissions('org-1');

    expect(permissions[GlobalRole.SUPER_ADMIN]).toContain('VIEW_DASHBOARD');
    expect(permissions[GlobalRole.VIEWER]).toEqual(['VIEW_DASHBOARD']);
  });

  it('normalizes and stores updated role permissions', async () => {
    prisma.org.findUnique.mockResolvedValue({
      id: 'org-1',
    });
    prisma.org.update.mockResolvedValue({
      id: 'org-1',
      rolePermissionsJson: {
        [GlobalRole.DEV]: ['MANAGE_TASKS', 'VIEW_DASHBOARD'],
      },
    });

    const updated = await service.updateRolePermissions('org-1', {
      [GlobalRole.DEV]: ['VIEW_DASHBOARD', 'MANAGE_TASKS', 'MANAGE_TASKS', ''],
    });

    expect(prisma.org.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: {
        rolePermissionsJson: expect.objectContaining({
          [GlobalRole.DEV]: ['MANAGE_TASKS', 'VIEW_DASHBOARD'],
        }),
      },
    });
    expect(updated[GlobalRole.DEV]).toEqual(['MANAGE_TASKS', 'VIEW_DASHBOARD']);
  });

  it('throws when the org does not exist', async () => {
    prisma.org.findUnique.mockResolvedValue(null);

    await expect(service.getRolePermissions('missing-org')).rejects.toBeInstanceOf(NotFoundException);
  });
});
