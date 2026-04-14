import { Controller, Get, Patch, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { OrgService } from './org.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GlobalRole } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('org')
@ApiBearerAuth()
@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  createOrg(@Body() body: { name: string; slug: string; plan?: string; maxUsers?: number; maxProjects?: number; maxStorageMB?: number }) {
    return this.orgService.createOrg(body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getOrg(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.getOrg(orgId);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async updateOrg(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }, @Body() body: any) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.updateOrg(orgId, body);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsage(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.getUsage(orgId);
  }

  @Get('role-permissions')
  @UseGuards(JwtAuthGuard)
  async getRolePermissions(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.getRolePermissions(orgId);
  }

  @Patch('role-permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  async updateRolePermissions(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }, @Body() body: { rolePermissions: Record<string, unknown> }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.updateRolePermissions(orgId, body.rolePermissions);
  }

  @Get('onboarding-status')
  @UseGuards(JwtAuthGuard)
  async getOnboardingStatus(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.getOnboardingStatus(orgId);
  }

  @Patch('onboarding-dismiss')
  @UseGuards(JwtAuthGuard)
  async dismissOnboarding(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.dismissOnboarding(orgId);
  }

  @Get('sso-config')
  @UseGuards(JwtAuthGuard)
  async getSsoConfigs(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.getSsoConfigs(orgId);
  }

  @Post('sso-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  async createSsoConfig(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }, @Body() body: any) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.createSsoConfig(orgId, body);
  }

  @Patch('sso-config/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  async updateSsoConfig(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }, @Param('id') id: string, @Body() body: any) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.updateSsoConfig(orgId, id, body);
  }

  @Delete('sso-config/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  async deleteSsoConfig(@Request() req: { user: { orgId?: string; id?: string; sub?: string } }, @Param('id') id: string) {
    const orgId = await this.orgService.resolveOrgId(req.user);
    return this.orgService.deleteSsoConfig(orgId, id);
  }
}
