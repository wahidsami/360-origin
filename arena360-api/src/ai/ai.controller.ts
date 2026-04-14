import { BadRequestException, Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatDto, ProjectContextDto, FindingContextDto } from './dto/ai.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('project/summary')
  async projectSummary(@Request() req: { user: { orgId: string } }, @Body() body: ProjectContextDto) {
    if (!body.projectId) throw new BadRequestException('projectId required');
    return { summary: await this.aiService.generateProjectSummary(body.projectId, req.user.orgId) };
  }

  @Post('project/suggest-tasks')
  async suggestTasks(@Request() req: { user: { orgId: string } }, @Body() body: ProjectContextDto) {
    if (!body.projectId) throw new BadRequestException('projectId required');
    return { suggestions: await this.aiService.suggestTasks(body.projectId, req.user.orgId) };
  }

  @Post('project/status-report')
  async statusReport(@Request() req: { user: { orgId: string } }, @Body() body: ProjectContextDto) {
    if (!body.projectId) throw new BadRequestException('projectId required');
    return { report: await this.aiService.generateStatusReport(body.projectId, req.user.orgId) };
  }

  @Post('finding/analyze')
  async analyzeFinding(@Request() req: { user: { orgId: string } }, @Body() body: FindingContextDto) {
    return { analysis: await this.aiService.analyzeFinding(body.findingId, req.user.orgId) };
  }

  @Post('chat')
  async chat(@Request() req: { user: { orgId: string } }, @Body() body: ChatDto & { projectId?: string; findingId?: string }) {
    const context = body.projectId ? { projectId: body.projectId } : body.findingId ? { findingId: body.findingId } : undefined;
    const reply = await this.aiService.chatWithContext(body.messages, context, req.user.orgId);
    return { reply };
  }
}
