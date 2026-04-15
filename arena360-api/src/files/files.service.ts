import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { UserWithRoles, ScopeUtils } from '../common/utils/scope.utils';
import { FileCategory, FileVisibility, FileScopeType } from '@prisma/client';

@Injectable()
export class FilesService {
    constructor(
        private prisma: PrismaService,
        private storage: StorageService
    ) { }

    private resolveMimeType(filename: string, originalMime: string): string {
        if (originalMime !== 'application/octet-stream' && originalMime !== '') {
            return originalMime;
        }

        const ext = filename.split('.').pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp'
        };

        return (ext && mimeMap[ext]) || originalMime;
    }

    // === CLIENT FILES ===

    async listClientFiles(clientId: string, user: UserWithRoles) {
        const clientScope = ScopeUtils.clientScope(user, 'id');

        // Verify client exists and user has access
        const client = await this.prisma.client.findFirst({
            where: {
                orgId: user.orgId,
                AND: [
                    { id: clientId },
                    clientScope.id ? { id: clientScope.id } : {},
                ],
            }
        });

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.fileAsset.findMany({
            where: {
                clientId,
                scopeType: 'CLIENT',
                orgId: user.orgId,
                // Client users only see CLIENT visibility files
                ...(isClientUser && { visibility: 'CLIENT' })
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async uploadClientFile(
        clientId: string,
        user: UserWithRoles,
        file: Express.Multer.File,
        category: FileCategory,
        visibility?: FileVisibility,
        displayName?: string
    ) {
        const clientScope = ScopeUtils.clientScope(user, 'id');

        // Verify client exists and user has access
        const client = await this.prisma.client.findFirst({
            where: {
                orgId: user.orgId,
                AND: [
                    { id: clientId },
                    clientScope.id ? { id: clientScope.id } : {},
                ],
            }
        });

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isInternal = internalRoles.includes(user.role);
        const isClientMember = clientRoles.includes(user.role);

        if (!isInternal && !isClientMember) {
            throw new ForbiddenException('You do not have permission to upload files');
        }

        // Client uploads default to shared-with-client and cannot create internal-only files.
        const fileVisibility = visibility || (isClientMember ? 'CLIENT' : 'INTERNAL');
        if (user.role === 'DEV' && fileVisibility === 'CLIENT') {
            throw new ForbiddenException('DEV role can only upload INTERNAL files');
        }
        if (isClientMember && fileVisibility !== 'CLIENT') {
            throw new ForbiddenException('Client members can only upload CLIENT visibility files');
        }

        // Generate storage key
        const storageKey = this.storage.generateStorageKey(
            user.orgId,
            'CLIENT',
            clientId,
            category,
            file.originalname
        );

        // Upload to S3
        await this.storage.putObject(storageKey, file.buffer, file.mimetype);

        // Create database record
        return this.prisma.fileAsset.create({
            data: {
                orgId: user.orgId,
                scopeType: 'CLIENT',
                clientId,
                uploaderId: user.id,
                category,
                visibility: fileVisibility,
                filename: displayName || file.originalname,
                mimeType: this.resolveMimeType(file.originalname, file.mimetype),
                sizeBytes: file.size,
                storageKey
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
    }

    async downloadClientFile(clientId: string, fileId: string, user: UserWithRoles, download: boolean = false): Promise<string> {
        const clientScope = ScopeUtils.clientScope(user, 'id');

        // Verify client exists and user has access
        const client = await this.prisma.client.findFirst({
            where: {
                orgId: user.orgId,
                AND: [
                    { id: clientId },
                    clientScope.id ? { id: clientScope.id } : {},
                ],
            }
        });

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        // Get file record
        const file = await this.prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                clientId,
                scopeType: 'CLIENT',
                orgId: user.orgId
            }
        });

        if (!file) {
            throw new NotFoundException('File not found');
        }

        // Client users can only download CLIENT visibility files
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        if (clientRoles.includes(user.role) && file.visibility !== 'CLIENT') {
            throw new ForbiddenException('You do not have permission to access this file');
        }

        // Generate signed URL (valid for 1 hour)
        return this.storage.getSignedUrl(file.storageKey, 3600, download);
    }

    async deleteClientFile(clientId: string, fileId: string, user: UserWithRoles): Promise<void> {
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can delete files');
        }

        const clientScope = ScopeUtils.clientScope(user, 'id');
        const client = await this.prisma.client.findFirst({
            where: {
                orgId: user.orgId,
                AND: [
                    { id: clientId },
                    clientScope.id ? { id: clientScope.id } : {},
                ],
            }
        });

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        const file = await this.prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                clientId,
                scopeType: 'CLIENT',
                orgId: user.orgId
            }
        });

        if (!file) {
            throw new NotFoundException('File not found');
        }

        await this.storage.deleteObject(file.storageKey);
        await this.prisma.fileAsset.delete({ where: { id: fileId } });
    }

    // === PROJECT FILES ===

    async listProjectFiles(projectId: string, user: UserWithRoles) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user) },
            select: { id: true }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.fileAsset.findMany({
            where: {
                orgId: user.orgId,
                projectId,
                scopeType: 'PROJECT',
                deletedAt: null,
                category: {
                    in: ['DOCS', 'DESIGNS', 'BUILDS', 'OTHER'],
                },
                ...(isClientUser && { visibility: 'CLIENT' }),
                projectReportEntryMedia: {
                    none: {},
                },
                projectReportExports: {
                    none: {},
                },
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async uploadProjectFile(
        projectId: string,
        user: UserWithRoles,
        file: Express.Multer.File,
        category: FileCategory,
        visibility?: FileVisibility,
        displayName?: string
    ) {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user) }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Only internal roles can upload files
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can upload files');
        }

        // DEV can only upload INTERNAL files unless specified
        const fileVisibility = visibility || 'INTERNAL';
        if (user.role === 'DEV' && fileVisibility === 'CLIENT') {
            throw new ForbiddenException('DEV role can only upload INTERNAL files');
        }

        // Generate storage key
        const storageKey = this.storage.generateStorageKey(
            user.orgId,
            'PROJECT',
            projectId,
            category,
            file.originalname
        );

        // Upload to S3
        await this.storage.putObject(storageKey, file.buffer, file.mimetype);

        // Create database record
        return this.prisma.fileAsset.create({
            data: {
                orgId: user.orgId,
                scopeType: 'PROJECT',
                projectId,
                uploaderId: user.id,
                category,
                visibility: fileVisibility,
                filename: displayName || file.originalname,
                mimeType: this.resolveMimeType(file.originalname, file.mimetype),
                sizeBytes: file.size,
                storageKey
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
    }

    async downloadProjectFile(projectId: string, fileId: string, user: UserWithRoles, download: boolean = false): Promise<string> {
        // Verify project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, ...ScopeUtils.projectScope(user) },
            select: { id: true, clientId: true }
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Get file record
        const file = await this.prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                orgId: user.orgId,
                OR: [
                    {
                        projectId,
                        scopeType: 'PROJECT',
                    },
                    {
                        clientId: project.clientId,
                        scopeType: 'CLIENT',
                        visibility: 'CLIENT',
                    },
                ],
            }
        });

        if (!file) {
            throw new NotFoundException('File not found');
        }

        // Client users can only download CLIENT visibility files
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        if (clientRoles.includes(user.role) && file.visibility !== 'CLIENT') {
            throw new ForbiddenException('You do not have permission to access this file');
        }

        // Generate signed URL (valid for 1 hour)
        return this.storage.getSignedUrl(file.storageKey, 3600, download);
    }

    async deleteProjectFile(projectId: string, fileId: string, user: UserWithRoles): Promise<void> {
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can delete files');
        }
        const file = await this.prisma.fileAsset.findFirst({
            where: { id: fileId, projectId, scopeType: 'PROJECT', orgId: user.orgId }
        });
        if (!file) throw new NotFoundException('File not found');
        await this.storage.deleteObject(file.storageKey);
        await this.prisma.fileAsset.delete({ where: { id: fileId } });
    }

    // === FINDING FILES ===


    async listFindingFiles(findingId: string, user: UserWithRoles) {
        // Verify finding exists and user has access
        const finding = await this.prisma.finding.findFirst({
            where: { 
                id: findingId, 
                project: { ...ScopeUtils.projectScope(user) }
            }
        });

        if (!finding) {
            throw new NotFoundException('Finding not found');
        }

        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        const isClientUser = clientRoles.includes(user.role);

        return this.prisma.fileAsset.findMany({
            where: {
                findingId,
                scopeType: 'FINDING',
                orgId: user.orgId,
                // Client users only see CLIENT visibility files
                ...(isClientUser && { visibility: 'CLIENT' })
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async uploadFindingFile(
        findingId: string,
        user: UserWithRoles,
        file: Express.Multer.File,
        visibility?: FileVisibility
    ) {
        // Verify finding exists and user has access
        const finding = await this.prisma.finding.findFirst({
            where: { 
                id: findingId, 
                project: { ...ScopeUtils.projectScope(user) }
            }
        });

        if (!finding) {
            throw new NotFoundException('Finding not found');
        }

        // Only internal roles can upload files
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can upload files');
        }

        // DEV can only upload INTERNAL files unless specified
        const fileVisibility = visibility || finding.visibility || 'INTERNAL';
        if (user.role === 'DEV' && fileVisibility === 'CLIENT') {
            throw new ForbiddenException('DEV role can only upload INTERNAL files');
        }

        // Generate storage key
        const storageKey = this.storage.generateStorageKey(
            user.orgId,
            'FINDING',
            findingId,
            'EVIDENCE',
            file.originalname
        );

        // Upload to S3
        await this.storage.putObject(storageKey, file.buffer, file.mimetype);

        // Create database record
        return this.prisma.fileAsset.create({
            data: {
                orgId: user.orgId,
                scopeType: 'FINDING',
                findingId,
                projectId: finding.projectId, // Also associate with project for easier lookup
                uploaderId: user.id,
                category: 'EVIDENCE',
                visibility: fileVisibility,
                filename: file.originalname,
                mimeType: this.resolveMimeType(file.originalname, file.mimetype),
                sizeBytes: file.size,
                storageKey
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
    }

    async downloadFindingFile(findingId: string, fileId: string, user: UserWithRoles, download: boolean = false): Promise<string> {
        // Verify finding exists and user has access
        const finding = await this.prisma.finding.findFirst({
            where: { 
                id: findingId, 
                project: { ...ScopeUtils.projectScope(user) }
            }
        });

        if (!finding) {
            throw new NotFoundException('Finding not found');
        }

        // Get file record
        const file = await this.prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                findingId,
                scopeType: 'FINDING',
                orgId: user.orgId
            }
        });

        if (!file) {
            throw new NotFoundException('File not found');
        }

        // Client users can only download CLIENT visibility files
        const clientRoles = ['CLIENT_OWNER', 'CLIENT_MANAGER', 'CLIENT_MEMBER'];
        if (clientRoles.includes(user.role) && file.visibility !== 'CLIENT') {
            throw new ForbiddenException('You do not have permission to access this file');
        }

        // Generate signed URL (valid for 1 hour)
        return this.storage.getSignedUrl(file.storageKey, 3600, download);
    }

    async deleteFindingFile(findingId: string, fileId: string, user: UserWithRoles): Promise<void> {
        // Only internal staff can delete finding files
        const internalRoles = ['SUPER_ADMIN', 'OPS', 'PM', 'DEV', 'QA'];
        if (!internalRoles.includes(user.role)) {
            throw new ForbiddenException('Only internal staff can delete finding evidence');
        }

        // Verify file exists and belongs to the finding and org
        const file = await this.prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                findingId,
                scopeType: 'FINDING',
                orgId: user.orgId
            }
        });

        if (!file) {
            throw new NotFoundException('Evidence file not found');
        }

        // Delete from storage
        await this.storage.deleteObject(file.storageKey);

        // Delete record from DB
        await this.prisma.fileAsset.delete({
            where: { id: fileId }
        });
    }

    /** Quick file upload for discussion messages - no DB record, returns a download URL */
    async uploadTempFile(user: UserWithRoles, file: Express.Multer.File): Promise<string> {
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `temp/${user.orgId}/${Date.now()}_${sanitizedName}`;
        await this.storage.putObject(key, file.buffer, file.mimetype);
        // Return a proxy streaming URL valid for 10 years so thread links don't expire prematurely
        // Using 10 years to strictly avoid Y2K38 problems
        return this.storage.getSignedUrl(key, 10 * 365 * 24 * 3600, true, true);
    }
}
