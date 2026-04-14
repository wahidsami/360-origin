import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScopeUtils, UserWithRoles } from '../common/utils/scope.utils';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';
import { CreateProjectUpdateDto } from './dto/project-update.dto';

@Injectable()
export class MilestonesService {
    constructor(private prisma: PrismaService) { }

    // === MILESTONES ===

    async findAllMilestones(projectId: string, user: UserWithRoles) {
        // Verify user has access to this project
        await this.verifyProjectAccess(projectId, user);

        const milestones = await this.prisma.milestone.findMany({
            where: {
                projectId,
                orgId: user.orgId
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                },
                tasks: {
                    where: { deletedAt: null },
                    select: { id: true, title: true, status: true, dueDate: true }
                }
            },
            orderBy: { dueDate: 'asc' }
        });

        // Calculate progress and status for each milestone
        return milestones.map(m => {
            const tasks = m.tasks || [];
            const total = tasks.length;
            const completed = tasks.filter(t => t.status === 'DONE').length;
            const overdue = tasks.filter(t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < new Date()).length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : m.percentComplete;

            // Simple status logic: Progress vs Time
            let statusText: 'On Track' | 'At Risk' | 'Overdue' = 'On Track';
            const now = new Date();
            const due = new Date(m.dueDate);
            const created = new Date(m.createdAt);
            
            if (m.status === 'COMPLETED' || progress === 100) {
                statusText = 'On Track';
            } else if (now > due) {
                statusText = 'Overdue';
            } else {
                const totalDuration = due.getTime() - created.getTime();
                const elapsedDuration = now.getTime() - created.getTime();
                const expectedProgress = totalDuration > 0 ? (elapsedDuration / totalDuration) * 100 : 0;
                
                if (progress < expectedProgress * 0.8) {
                    statusText = 'At Risk';
                }
            }

            return {
                ...m,
                stats: {
                    total,
                    completed,
                    overdue,
                    progress,
                    statusText
                }
            };
        });
    }

    async createMilestone(projectId: string, user: UserWithRoles, dto: CreateMilestoneDto) {
        // Verify user has access to this project
        await this.verifyProjectAccess(projectId, user);

        // Only internal roles can create milestones
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can create milestones');
        }

        const data: any = { ...dto };
        if (data.ownerId === '') data.ownerId = null;

        // Ensure dueDate is a valid Date
        let dueDate: Date;
        if (data.dueDate) {
            dueDate = new Date(data.dueDate);
            if (isNaN(dueDate.getTime())) {
                throw new BadRequestException('Invalid dueDate format');
            }
        } else {
            throw new BadRequestException('dueDate is required');
        }

        // Strip extra fields
        const { id, orgId: dOrgId, projectId: dProjId, createdAt, updatedAt, deletedAt, owner, project, tasks, ...rest } = data;

        return this.prisma.milestone.create({
            data: {
                ...rest,
                dueDate,
                projectId,
                orgId: user.orgId
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
    }

    async updateMilestone(projectId: string, milestoneId: string, user: UserWithRoles, dto: UpdateMilestoneDto) {
        // Verify milestone exists and belongs to project
        const milestone = await this.prisma.milestone.findFirst({
            where: {
                id: milestoneId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!milestone) {
            throw new NotFoundException('Milestone not found');
        }

        // Only internal roles can update milestones
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can update milestones');
        }

        const data: any = { ...dto };
        if (data.ownerId === '') data.ownerId = null;

        // Strip extra fields
        const { id, orgId: dOrgId, projectId: dProjId, createdAt, updatedAt, deletedAt, owner, project, tasks, ...rest } = data;
        const updateData: any = { ...rest };

        // Handle dueDate strictly
        if (data.dueDate) {
            const d = new Date(data.dueDate);
            if (!isNaN(d.getTime())) {
                updateData.dueDate = d;
            }
        }

        return this.prisma.milestone.update({
            where: { id: milestoneId },
            data: updateData,
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
    }

    async deleteMilestone(projectId: string, milestoneId: string, user: UserWithRoles) {
        // Verify milestone exists and belongs to project
        const milestone = await this.prisma.milestone.findFirst({
            where: {
                id: milestoneId,
                projectId,
                orgId: user.orgId
            }
        });

        if (!milestone) {
            throw new NotFoundException('Milestone not found');
        }

        // Only internal roles can delete milestones
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only SUPER_ADMIN, OPS, or PM can delete milestones');
        }

        await this.prisma.milestone.delete({
            where: { id: milestoneId }
        });
    }

    // === PROJECT UPDATES ===

    async findAllUpdates(projectId: string, user: UserWithRoles) {
        // Verify user has access to this project
        await this.verifyProjectAccess(projectId, user);

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.projectUpdate.findMany({
            where: {
                projectId,
                orgId: user.orgId,
                // Client users only see CLIENT visibility updates
                ...(isClientUser && { visibility: 'CLIENT' })
            },
            include: {
                author: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async createUpdate(projectId: string, user: UserWithRoles, dto: CreateProjectUpdateDto) {
        // Verify user has access to this project
        await this.verifyProjectAccess(projectId, user);

        // Only internal roles can create updates
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can create project updates');
        }

        // DEV can only create INTERNAL updates
        // PM/OPS/SUPER_ADMIN can create both INTERNAL and CLIENT updates
        let visibility = dto.visibility || 'INTERNAL';
        if (user.role === 'DEV' && visibility === 'CLIENT') {
            throw new ForbiddenException('DEV role can only create INTERNAL updates');
        }

        return this.prisma.projectUpdate.create({
            data: {
                ...dto,
                visibility,
                projectId,
                authorId: user.id,
                orgId: user.orgId
            },
            include: {
                author: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
    }

    // Helper method to verify project access
    private async verifyProjectAccess(projectId: string, user: UserWithRoles) {
        const project = await this.prisma.project.findFirst({
            where: {
                id: projectId,
                ...ScopeUtils.projectScope(user)
            }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        return project;
    }
}
