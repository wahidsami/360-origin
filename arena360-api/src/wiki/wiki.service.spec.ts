import { WikiService } from './wiki.service';

describe('WikiService', () => {
  const prisma = {
    wikiPage: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wikiPageVersion: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  const user = {
    id: 'user-1',
    orgId: 'org-1',
  } as any;

  let service: WikiService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WikiService(prisma);
  });

  it('creates a unique wiki slug when the requested slug already exists', async () => {
    prisma.wikiPage.findFirst
      .mockResolvedValueOnce({ id: 'existing-1' })
      .mockResolvedValueOnce(null);
    prisma.wikiPage.create.mockResolvedValue({
      id: 'page-2',
      slug: 'getting-started-2',
      title: 'Getting Started',
      body: 'Hello',
    });

    const page = await service.create(user.orgId, user, {
      slug: 'getting-started',
      title: 'Getting Started',
      body: 'Hello',
    });

    expect(page.slug).toBe('getting-started-2');
    expect(prisma.wikiPage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          slug: 'getting-started-2',
          title: 'Getting Started',
          body: 'Hello',
          authorId: 'user-1',
        }),
      }),
    );
  });

  it('keeps the current page slug when updating a wiki page without collisions', async () => {
    prisma.wikiPage.findFirst.mockResolvedValueOnce({
      id: 'page-1',
      orgId: 'org-1',
      slug: 'release-notes',
      title: 'Release Notes',
      body: 'Old body',
    });
    prisma.wikiPage.update.mockResolvedValue({
      id: 'page-1',
      slug: 'release-notes',
      title: 'Release Notes Updated',
      body: 'New body',
    });

    const page = await service.update(user.orgId, 'page-1', user, {
      title: 'Release Notes Updated',
      body: 'New body',
    });

    expect(page.slug).toBe('release-notes');
    expect(prisma.wikiPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'page-1' },
        data: expect.objectContaining({
          title: 'Release Notes Updated',
          body: 'New body',
        }),
      }),
    );
  });
});
