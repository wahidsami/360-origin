import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { UserWithRoles } from '../common/utils/scope.utils';
import { CreateWikiPageDto, UpdateWikiPageDto } from './dto/wiki.dto';
import { FileCategory } from '@prisma/client';

@Injectable()
export class WikiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async ensureOrg(orgId: string, user: UserWithRoles) {
    if (user.orgId !== orgId) throw new ForbiddenException('Access denied');
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private resolveMimeType(filename: string, originalMime: string): string {
    if (originalMime !== 'application/octet-stream' && originalMime !== '') return originalMime;
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      rtf: 'application/rtf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
    };
    return (ext && mimeMap[ext]) || originalMime || 'application/octet-stream';
  }

  private async ensurePage(orgId: string, id: string, user: UserWithRoles) {
    await this.ensureOrg(orgId, user);
    const page = await this.prisma.wikiPage.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    return page;
  }

  private async ensureUniqueSlug(orgId: string, slug: string, excludePageId?: string) {
    const baseSlug = this.slugify(slug) || 'page';
    let candidate = baseSlug;
    let index = 2;

    while (true) {
      const existing = await this.prisma.wikiPage.findFirst({
        where: {
          orgId,
          slug: candidate,
          deletedAt: null,
          ...(excludePageId ? { id: { not: excludePageId } } : {}),
        },
        select: { id: true },
      });

      if (!existing) return candidate;
      candidate = `${baseSlug}-${index}`;
      index += 1;
    }
  }

  private readonly wikiScopeType = 'WIKI' as any;

  async listPages(orgId: string, user: UserWithRoles) {
    await this.ensureOrg(orgId, user);
    return this.prisma.wikiPage.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, slug: true, title: true, updatedAt: true },
    });
  }

  async getBySlug(orgId: string, slug: string, user: UserWithRoles) {
    await this.ensureOrg(orgId, user);
    const page = await this.prisma.wikiPage.findFirst({
      where: { orgId, slug, deletedAt: null },
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    return page;
  }

  async getById(orgId: string, id: string, user: UserWithRoles) {
    await this.ensureOrg(orgId, user);
    const page = await this.prisma.wikiPage.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    return page;
  }

  async create(orgId: string, user: UserWithRoles, dto: CreateWikiPageDto) {
    await this.ensureOrg(orgId, user);
    const slug = await this.ensureUniqueSlug(orgId, dto.slug || dto.title || 'page');
    const page = await this.prisma.wikiPage.create({
      data: {
        orgId,
        slug,
        title: dto.title,
        body: dto.body,
        authorId: user.id,
      },
    });
    await this.prisma.wikiPageVersion.create({
      data: { pageId: page.id, title: page.title, body: page.body, authorId: user.id },
    });
    return page;
  }

  async update(orgId: string, id: string, user: UserWithRoles, dto: UpdateWikiPageDto) {
    await this.ensureOrg(orgId, user);
    const page = await this.prisma.wikiPage.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    const slug = dto.slug != null ? await this.ensureUniqueSlug(orgId, dto.slug, id) : undefined;
    const updated = await this.prisma.wikiPage.update({
      where: { id },
      data: {
        ...(dto.title != null && { title: dto.title }),
        ...(slug !== undefined && { slug }),
        ...(dto.body != null && { body: dto.body }),
      },
    });
    await this.prisma.wikiPageVersion.create({
      data: {
        pageId: updated.id,
        title: updated.title,
        body: updated.body,
        authorId: user.id,
      },
    });
    return updated;
  }

  async delete(orgId: string, id: string, user: UserWithRoles) {
    await this.ensureOrg(orgId, user);
    const page = await this.prisma.wikiPage.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    return this.prisma.wikiPage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getVersions(orgId: string, pageId: string, user: UserWithRoles) {
    await this.ensurePage(orgId, pageId, user);
    return this.prisma.wikiPageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listAttachments(orgId: string, pageId: string, user: UserWithRoles) {
    await this.ensurePage(orgId, pageId, user);
    return this.prisma.fileAsset.findMany({
      where: {
        orgId,
        scopeType: this.wikiScopeType,
        wikiPageId: pageId,
        deletedAt: null,
      } as any,
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadAttachment(orgId: string, pageId: string, user: UserWithRoles, file: Express.Multer.File, displayName?: string) {
    const page = await this.ensurePage(orgId, pageId, user);
    if (!file) throw new BadRequestException('No file provided');

    const storageKey = this.storage.generateStorageKey(orgId, this.wikiScopeType, page.id, FileCategory.DOCS, file.originalname);
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);

    return this.prisma.fileAsset.create({
      data: {
        orgId,
        scopeType: this.wikiScopeType,
        wikiPageId: page.id,
        uploaderId: user.id,
        category: FileCategory.DOCS,
        visibility: 'INTERNAL',
        filename: displayName || file.originalname,
        mimeType: this.resolveMimeType(file.originalname, file.mimetype),
        sizeBytes: file.size,
        storageKey,
      } as any,
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async downloadAttachment(orgId: string, pageId: string, fileId: string, user: UserWithRoles, download = false) {
    await this.ensurePage(orgId, pageId, user);
    const file = await this.prisma.fileAsset.findFirst({
      where: {
        id: fileId,
        orgId,
        wikiPageId: pageId,
        scopeType: this.wikiScopeType,
        deletedAt: null,
      } as any,
    });
    if (!file) throw new NotFoundException('Attachment not found');
    return this.storage.getSignedUrl(file.storageKey, 3600, download);
  }

  async deleteAttachment(orgId: string, pageId: string, fileId: string, user: UserWithRoles) {
    await this.ensurePage(orgId, pageId, user);
    const file = await this.prisma.fileAsset.findFirst({
      where: {
        id: fileId,
        orgId,
        wikiPageId: pageId,
        scopeType: this.wikiScopeType,
        deletedAt: null,
      } as any,
    });
    if (!file) throw new NotFoundException('Attachment not found');
    await this.storage.deleteObject(file.storageKey);
    await this.prisma.fileAsset.delete({ where: { id: fileId } });
  }
}
