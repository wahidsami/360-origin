import { BadGatewayException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) this.client = new OpenAI({ apiKey: key });
  }

  private get model(): string {
    return this.config.get<string>('OPENAI_MODEL') || 'gpt-4o';
  }

  private ensureClient() {
    if (!this.client) {
      throw new ServiceUnavailableException('AI summary generation is unavailable because AI is not configured on the server.');
    }
    return this.client;
  }

  private extractJsonObject(raw: string) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
      throw new BadGatewayException('AI returned an empty response while generating the report summary. Please try again.');
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch?.[1]?.trim() || trimmed;

    try {
      return JSON.parse(candidate);
    } catch {
      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
        } catch {
          // fall through to user-safe error below
        }
      }
    }

    this.logger.warn(`AI returned non-JSON project report narrative payload: ${candidate.slice(0, 400)}`);
    throw new BadGatewayException('AI returned an invalid summary format. Please retry generating the report summary.');
  }

  private async chat(system: string, user: string): Promise<string> {
    const client = this.ensureClient();
    try {
      const res = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 1024,
      });
      return res.choices[0]?.message?.content?.trim() || '';
    } catch (error: any) {
      this.logger.error(`AI chat request failed: ${error?.message || error}`);
      throw new ServiceUnavailableException('AI summary generation is temporarily unavailable. Please try again in a moment.');
    }
  }

  async generateProjectSummary(projectId: string, orgId: string): Promise<string> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      include: {
        client: { select: { name: true } },
        tasks: { where: { deletedAt: null }, take: 50, select: { title: true, status: true } },
        milestones: { where: { deletedAt: null }, select: { title: true, status: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const text = JSON.stringify({
      name: project.name,
      description: project.description,
      status: project.status,
      health: project.health,
      progress: project.progress,
      client: project.client?.name,
      taskCount: project.tasks.length,
      tasks: project.tasks.map((t) => ({ title: t.title, status: t.status })),
      milestones: project.milestones.map((m) => ({ title: m.title, status: m.status })),
    }, null, 2);
    return this.chat(
      'You are a project analyst. Summarize the project in 2–4 short paragraphs: objectives, current status, and key risks or next steps.',
      `Project data:\n${text}`,
    );
  }

  async suggestTasks(projectId: string, orgId: string): Promise<string> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      include: {
        tasks: { where: { deletedAt: null }, select: { title: true, status: true } },
        milestones: { where: { deletedAt: null }, select: { title: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const text = JSON.stringify({
      name: project.name,
      description: project.description,
      existingTasks: project.tasks,
      milestones: project.milestones,
    }, null, 2);
    return this.chat(
      'You are a project manager. Suggest 3–6 concrete next tasks as a JSON array of objects with "title" and "description" only. Output only the JSON array, no markdown.',
      `Project:\n${text}`,
    );
  }

  async analyzeFinding(findingId: string, orgId: string): Promise<string> {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, orgId },
      include: { project: { select: { name: true } } },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    const text = JSON.stringify({
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      remediation: finding.remediation,
      impact: finding.impact,
      project: finding.project?.name,
    }, null, 2);
    return this.chat(
      'You are a security/QA analyst. Based on the finding, suggest concise remediation steps and impact assessment. Use bullet points.',
      `Finding:\n${text}`,
    );
  }

  async generateStatusReport(projectId: string, orgId: string): Promise<string> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      include: {
        client: { select: { name: true } },
        tasks: { where: { deletedAt: null }, select: { title: true, status: true } },
        updates: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { title: true, content: true, createdAt: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const text = JSON.stringify({
      name: project.name,
      status: project.status,
      health: project.health,
      progress: project.progress,
      client: project.client?.name,
      tasks: project.tasks,
      recentUpdates: project.updates,
    }, null, 2);
    return this.chat(
      'You are a project manager. Write a short executive status report (3–5 paragraphs) suitable for a client: progress, highlights, and any blockers.',
      `Project data:\n${text}`,
    );
  }

  async generateProjectReportNarratives(projectReportId: string, orgId: string): Promise<{
    introduction: string;
    statisticsSummary: string;
    executiveSummary: string;
    strengthsSummary: string;
    complianceSummary: string;
    recommendationsSummary: string;
  }> {
    const report = await this.prisma.projectReport.findFirst({
      where: { id: projectReportId, orgId, deletedAt: null },
      include: {
        project: { select: { name: true } },
        client: { select: { name: true } },
        template: { select: { name: true, category: true } },
        performedBy: { select: { name: true } },
        entries: {
          where: { deletedAt: null },
          select: {
            serviceName: true,
            issueTitle: true,
            issueDescription: true,
            severity: true,
            category: true,
            subcategory: true,
            recommendation: true,
            status: true,
            rowDataJson: true,
          },
        },
      },
    });
    if (!report) throw new BadGatewayException('Project report data could not be loaded for AI summary generation.');

    const normalizeOutcome = (value: unknown): 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_APPLICABLE' | 'NOT_TESTED' => {
      if (value === 'PASS' || value === 'FAIL' || value === 'PARTIAL' || value === 'NOT_APPLICABLE' || value === 'NOT_TESTED') {
        return value;
      }
      return 'FAIL';
    };

    const outcomeCounts = report.entries.reduce(
      (acc, entry) => {
        const outcome = normalizeOutcome((entry.rowDataJson as any)?.auditOutcome);
        acc[outcome] += 1;
        return acc;
      },
      {
        PASS: 0,
        FAIL: 0,
        PARTIAL: 0,
        NOT_APPLICABLE: 0,
        NOT_TESTED: 0,
      },
    );
    const scoredChecks = outcomeCounts.PASS + outcomeCounts.FAIL + outcomeCounts.PARTIAL;
    const compliancePercentage = scoredChecks > 0 ? Math.round(((outcomeCounts.PASS + outcomeCounts.PARTIAL * 0.5) / scoredChecks) * 100) : 0;

    const payload = JSON.stringify(
      {
        report: {
          title: report.title,
          description: report.description,
          template: report.template?.name,
          category: report.template?.category,
          outputLocale: report.outputLocale,
          project: report.project?.name,
          client: report.client?.name,
          performedBy: report.performedBy?.name,
        },
        counts: {
          total: report.entries.length,
          critical: report.entries.filter((entry) => entry.severity === 'CRITICAL').length,
          high: report.entries.filter((entry) => entry.severity === 'HIGH').length,
          medium: report.entries.filter((entry) => entry.severity === 'MEDIUM').length,
          low: report.entries.filter((entry) => entry.severity === 'LOW').length,
          pass: outcomeCounts.PASS,
          fail: outcomeCounts.FAIL,
          partial: outcomeCounts.PARTIAL,
          notApplicable: outcomeCounts.NOT_APPLICABLE,
          notTested: outcomeCounts.NOT_TESTED,
          scoredChecks,
          compliancePercentage,
        },
        entries: report.entries,
      },
      null,
      2,
    );

    const raw = await this.chat(
      'You are an accessibility audit reporting assistant. Use only the provided structured audit results as source of truth. Write in the report output language from the payload. If outputLocale is ar, write natural professional Arabic. If outputLocale is en, write natural professional English. Do not invent issues, strengths, or recommendations. Output valid JSON only.',
      `Generate a JSON object with exactly these keys: introduction, statisticsSummary, strengthsSummary, complianceSummary, recommendationsSummary.

Requirements:
- introduction: 1 to 2 professional paragraphs introducing scope and overall result
- statisticsSummary: concise analytical narrative explaining outcome distribution, severity patterns for failed items, category themes, and testing coverage
- strengthsSummary: concise summary of what is working well, using only PASS items
- complianceSummary: explain the compliance percentage and what is still pending or excluded from scoring
- recommendationsSummary: grouped practical recommendation summary using only provided recommendations from FAIL and PARTIAL items
- Output valid JSON only

Report data:
${payload}`,
    );

    const parsed = this.extractJsonObject(raw);
    const statisticsSummary = parsed.statisticsSummary || parsed.executiveSummary || '';
    return {
      introduction: parsed.introduction || '',
      statisticsSummary,
      executiveSummary: parsed.executiveSummary || statisticsSummary,
      strengthsSummary: parsed.strengthsSummary || '',
      complianceSummary: parsed.complianceSummary || '',
      recommendationsSummary: parsed.recommendationsSummary || '',
    };
  }

  async chatWithContext(messages: { role: string; content: string }[], context?: { projectId?: string; findingId?: string }, orgId?: string): Promise<string> {
    let system = 'You are a helpful assistant for a project management platform. Be concise and professional.';
    if (context?.projectId && orgId) {
      const project = await this.prisma.project.findFirst({
        where: { id: context.projectId, orgId },
        select: { name: true, description: true, status: true },
      });
      if (project) system += `\nCurrent project context: ${project.name} (${project.status}). ${project.description || ''}`;
    }
    if (context?.findingId && orgId) {
      const finding = await this.prisma.finding.findFirst({
        where: { id: context.findingId, orgId },
        select: { title: true, severity: true },
      });
      if (finding) system += `\nCurrent finding context: ${finding.title} (${finding.severity}).`;
    }
    const client = this.ensureClient();
    const formatted = messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }));
    try {
      const res = await client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'system', content: system }, ...formatted],
        max_tokens: 1024,
      });
      return res.choices[0]?.message?.content?.trim() || '';
    } catch (error: any) {
      this.logger.error(`AI contextual chat request failed: ${error?.message || error}`);
      throw new ServiceUnavailableException('AI assistant is temporarily unavailable. Please try again in a moment.');
    }
  }
}
