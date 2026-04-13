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
  getOrg(@Request() req: { user: { orgId: string } }) {
    return this.orgService.getOrg(req.user.orgId);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  updateOrg(@Request() req: { user: { orgId: string } }, @Body() body: any) {
    return this.orgService.updateOrg(req.user.orgId, body);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  getUsage(@Request() req: { user: { orgId: string } }) {
    return this.orgService.getUsage(req.user.orgId);
  }

  @Get('role-permissions')
  @UseGuards(JwtAuthGuard)
  getRolePermissions(@Request() req: { user: { orgId: string } }) {
    return this.orgService.getRolePermissions(req.user.orgId);
  }

  @Patch('role-permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  updateRolePermissions(@Request() req: { user: { orgId: string } }, @Body() body: { rolePermissions: Record<string, unknown> }) {
    return this.orgService.updateRolePermissions(req.user.orgId, body.rolePermissions);
  }

  @Get('onboarding-status')
  @UseGuards(JwtAuthGuard)
  getOnboardingStatus(@Request() req: { user: { orgId: string } }) {
    return this.orgService.getOnboardingStatus(req.user.orgId);
  }

  @Patch('onboarding-dismiss')
  @UseGuards(JwtAuthGuard)
  dismissOnboarding(@Request() req: { user: { orgId: string } }) {
    return this.orgService.dismissOnboarding(req.user.orgId);
  }

  @Get('sso-config')
  @UseGuards(JwtAuthGuard)
  getSsoConfigs(@Request() req: { user: { orgId: string } }) {
    return this.orgService.getSsoConfigs(req.user.orgId);
  }

  @Post('sso-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  createSsoConfig(@Request() req: { user: { orgId: string } }, @Body() body: any) {
    return this.orgService.createSsoConfig(req.user.orgId, body);
  }

  @Patch('sso-config/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  updateSsoConfig(@Request() req: { user: { orgId: string } }, @Param('id') id: string, @Body() body: any) {
    return this.orgService.updateSsoConfig(req.user.orgId, id, body);
  }

  @Delete('sso-config/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  deleteSsoConfig(@Request() req: { user: { orgId: string } }, @Param('id') id: string) {
    return this.orgService.deleteSsoConfig(req.user.orgId, id);
  }
}
