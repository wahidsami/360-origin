import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, Patch, Delete } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) { }

    @Post()
    create(@Request() req: any, @Body() createDto: CreateProjectDto) {
        return this.projectsService.create(req.user, createDto);
    }

    @Get()
    findAll(@Request() req: any, @Query() query: any) {
        return this.projectsService.findAll(req.user, query);
    }

    @Get(':id')
    findOne(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.findOne(id, req.user);
    }

    @Get(':id/activity')
    getActivity(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.getActivity(id, req.user);
    }

    @Get(':id/readiness')
    getReadiness(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.getReadiness(id, req.user);
    }

    @Get(':id/metrics')
    getMetrics(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.getMetrics(id, req.user);
    }

    @Get(':id/environments')
    getEnvironments(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.getEnvironments(id, req.user);
    }

    @Post(':id/environments')
    createEnvironment(@Request() req: any, @Param('id') id: string, @Body() body: { name: string; url: string; username?: string | null }) {
        return this.projectsService.createEnvironment(id, req.user, body);
    }

    @Patch(':id/environments/:environmentId')
    updateEnvironment(@Request() req: any, @Param('id') id: string, @Param('environmentId') environmentId: string, @Body() body: { name?: string; url?: string; username?: string | null }) {
        return this.projectsService.updateEnvironment(id, environmentId, req.user, body);
    }

    @Delete(':id/environments/:environmentId')
    deleteEnvironment(@Request() req: any, @Param('id') id: string, @Param('environmentId') environmentId: string) {
        return this.projectsService.deleteEnvironment(id, environmentId, req.user);
    }

    @Patch(':id')
    update(@Request() req: any, @Param('id') id: string, @Body() updateDto: UpdateProjectDto) {
        return this.projectsService.update(id, req.user, updateDto);
    }

    @Patch(':id/archive')
    archive(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.archive(id, req.user);
    }

    @Delete(':id')
    remove(@Request() req: any, @Param('id') id: string) {
        return this.projectsService.remove(id, req.user);
    }

    // --- Members ---
    @Get(':id/members')
    getMembers(@Param('id') id: string) {
        return this.projectsService.getMembers(id);
    }

    @Post(':id/members')
    addMember(@Param('id') id: string, @Body() body: { userId: string, role: any }) {
        return this.projectsService.addMember(id, body.userId, body.role);
    }

    @Patch(':id/members/:userId')
    updateMember(@Param('id') id: string, @Param('userId') userId: string, @Body() body: { role: any }) {
        return this.projectsService.updateMemberRole(id, userId, body.role);
    }

    @Delete(':id/members/:userId')
    removeMember(@Param('id') id: string, @Param('userId') userId: string) {
        return this.projectsService.removeMember(id, userId);
    }
}
