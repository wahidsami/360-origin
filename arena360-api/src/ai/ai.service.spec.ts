import { AiService } from './ai.service';

describe('AiService', () => {
  const prisma = {
    project: {
      findFirst: jest.fn(),
    },
    finding: {
      findFirst: jest.fn(),
    },
  } as any;

  const config = {
    get: jest.fn(),
  } as any;

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation(() => undefined);
    service = new AiService(config, prisma);
  });

  it('builds a local project summary when AI is not configured', async () => {
    prisma.project.findFirst.mockResolvedValue({
      name: 'Alpha',
      description: 'Improve delivery confidence',
      status: 'IN_PROGRESS',
      health: 'AT_RISK',
      progress: 42,
      client: { name: 'Acme' },
      tasks: [
        { title: 'Task 1', status: 'DONE' },
        { title: 'Task 2', status: 'TODO' },
      ],
      milestones: [
        { title: 'Milestone 1', status: 'DONE' },
        { title: 'Milestone 2', status: 'IN_PROGRESS' },
      ],
    });

    const chatSpy = jest.spyOn(service as any, 'chat');

    const summary = await service.generateProjectSummary('project-1', 'org-1');

    expect(summary).toContain('Project Alpha is currently in progress with 42% progress for Acme.');
    expect(summary).toContain('Delivery snapshot: 1 of 2 tasks completed and 1 of 2 milestones completed.');
    expect(summary).toContain('Open work remains on 1 task and 1 milestone.');
    expect(summary).toContain('elevated risk');
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('falls back to the local project summary when AI request fails', async () => {
    prisma.project.findFirst.mockResolvedValue({
      name: 'Beta',
      description: null,
      status: 'ACTIVE',
      health: 'GOOD',
      progress: 10,
      client: null,
      tasks: [],
      milestones: [],
    });

    (service as any).client = {} as any;
    jest.spyOn(service as any, 'chat').mockRejectedValue(new Error('upstream unavailable'));

    const summary = await service.generateProjectSummary('project-2', 'org-1');

    expect(summary).toContain('Project Beta is currently active with 10% progress for no client assigned.');
    expect(summary).toContain('No tasks or milestones have been recorded yet');
    expect(summary).toContain('stable');
  });
});
