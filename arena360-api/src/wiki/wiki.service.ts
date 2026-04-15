import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UserWithRoles } from '../common/utils/scope.utils';
import { CreateWikiPageDto, UpdateWikiPageDto } from './dto/wiki.dto';

@Injectable()
export class WikiService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.ensureOrg(orgId, user);
    const page = await this.prisma.wikiPage.findFirst({
      where: { id: pageId, orgId, deletedAt: null },
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    return this.prisma.wikiPageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
