import { Controller, Post, Body, Get, Query, UseGuards, Request, Res, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { AuthService } from './auth.service';
import { SsoService, GoogleProfile } from './sso.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OperationalAlertsService } from '../common/operational-alerts.service';
import { LoginDto } from './dto/login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { SignupOrgDto } from './dto/signup-org.dto';
import { SamlCallbackDto } from './dto/saml-callback.dto';
import { UnauthorizedException } from '@nestjs/common';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private ssoService: SsoService,
        private config: ConfigService,
        private readonly alerts: OperationalAlertsService,
    ) { }

    @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute for login
    @Post('login')
    async login(@Body() body: LoginDto) {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.authService.login(user);
    }

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Post('2fa/verify-login')
    async verify2faLogin(@Body() body: { challenge: string; code: string }) {
        if (!body.challenge || !body.code) throw new UnauthorizedException('challenge and code required');
        return this.authService.verify2faLogin(body.challenge, body.code);
    }

    @UseGuards(JwtAuthGuard)
    @Post('2fa/setup')
    async setup2fa(@Request() req: any) {
        return this.authService.setup2fa(req.user.sub);
    }

    @UseGuards(JwtAuthGuard)
    @Post('2fa/verify-setup')
    async verify2faSetup(@Request() req: any, @Body() body: { code: string }) {
        if (!body.code) throw new UnauthorizedException('code required');
        return this.authService.verify2faSetup(req.user.sub, body.code);
    }

    @UseGuards(JwtAuthGuard)
    @Post('2fa/disable')
    async disable2fa(@Request() req: any, @Body() body: { password: string }) {
        if (!body.password) throw new UnauthorizedException('password required');
        return this.authService.disable2fa(req.user.sub, body.password);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
    @Post('accept-invite')
    async acceptInvite(@Body() body: AcceptInviteDto) {
        return this.authService.acceptInvite(body.token, body.password);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('forgot-password')
    async forgotPassword(@Body() body: { email: string }) {
        if (!body?.email?.trim()) throw new UnauthorizedException('Email is required');
        return this.authService.forgotPassword(body.email.trim());
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('reset-password')
    async resetPassword(@Body() body: { token: string; newPassword: string }) {
        if (!body?.token?.trim() || !body?.newPassword) throw new UnauthorizedException('Token and new password are required');
        return this.authService.resetPassword(body.token.trim(), body.newPassword);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('signup-org')
    async signupOrg(@Body() body: SignupOrgDto) {
        return this.authService.signupOrg(
            body.orgName,
            body.orgSlug,
            body.adminEmail,
            body.adminName ?? body.adminEmail.split('@')[0],
            body.password,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getProfile(@Request() req: any) {
        return { user: req.user };
    }

    @Get('sso/google')
    async googleSsoStart(@Query('org') org: string, @Res() res: express.Response) {
        if (!org) {
            return res.redirect(this.getFrontendUrl() + '/#/login?error=missing_org');
        }
        const { org: orgEntity, config } = await this.ssoService.getGoogleConfigByOrg(org);
        const baseUrl = this.config.get<string>('API_URL') || 'http://localhost:3000';
        const redirectUri = `${baseUrl}/auth/sso/google/callback`;
        const state = encodeURIComponent(orgEntity.id);
        const params = new URLSearchParams({
            client_id: config.clientId!,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state,
            access_type: 'offline',
            prompt: 'consent',
        });
        return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    }

    @Get('sso/google/callback')
    async googleSsoCallback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Query('error') error: string,
        @Res() res: express.Response,
    ) {
        const frontendUrl = this.getFrontendUrl();
        if (error) {
            return res.redirect(`${frontendUrl}/#/login?error=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
            return res.redirect(frontendUrl + '/#/login?error=missing_code');
        }
        let orgId: string;
        try {
            orgId = decodeURIComponent(state);
        } catch {
            return res.redirect(frontendUrl + '/#/login?error=invalid_state');
        }
        try {
            const { config } = await this.ssoService.getGoogleConfigByOrg(orgId);
            const baseUrl = this.config.get<string>('API_URL') || 'http://localhost:3000';
            const redirectUri = `${baseUrl}/auth/sso/google/callback`;
            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: config.clientId!,
                    client_secret: config.clientSecret!,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code',
                }),
            });
            if (!tokenRes.ok) {
                await this.alerts.alertOrg(
                    orgId,
                    'Google SSO callback failed',
                    `Google SSO token exchange failed with status ${tokenRes.status}.`,
                    { source: 'auth.google', entityType: 'auth' },
                );
                return res.redirect(`${frontendUrl}/#/login?error=token_exchange_failed`);
            }
            const tokens = await tokenRes.json();
            const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            if (!userInfoRes.ok) {
                await this.alerts.alertOrg(
                    orgId,
                    'Google SSO callback failed',
                    `Google SSO userinfo lookup failed with status ${userInfoRes.status}.`,
                    { source: 'auth.google', entityType: 'auth' },
                );
                return res.redirect(`${frontendUrl}/#/login?error=userinfo_failed`);
            }
            const profile: GoogleProfile = await userInfoRes.json();
            const user = await this.ssoService.findOrCreateUserFromGoogle(orgId, profile);
            const loginResult = await this.authService.login(user);
            const accessToken = 'accessToken' in loginResult ? (loginResult.accessToken as string) : '';
            return res.redirect(`${frontendUrl}/#/auth/callback?token=${encodeURIComponent(accessToken)}`);
        } catch (callbackError) {
            await this.alerts.alertOrg(
                orgId,
                'Google SSO callback failed',
                `Google SSO callback failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`,
                { source: 'auth.google', entityType: 'auth' },
            );
            return res.redirect(`${frontendUrl}/#/login?error=google_sso_failed`);
        }
    }

    @Get('sso/saml/metadata/:orgIdOrSlug')
    async samlMetadata(@Param('orgIdOrSlug') orgIdOrSlug: string, @Res() res: express.Response) {
        const baseUrl = this.config.get<string>('API_URL') || 'http://localhost:3000';
        const xml = await this.ssoService.getSamlMetadata(orgIdOrSlug, baseUrl);
        res.type('application/xml').send(xml);
    }

    @Get('sso/saml')
    async samlStart(@Query('org') org: string, @Res() res: express.Response) {
        const frontendUrl = this.getFrontendUrl();
        if (!org) {
            return res.redirect(`${frontendUrl}/#/login?error=missing_org`);
        }
        try {
            const baseUrl = this.config.get<string>('API_URL') || 'http://localhost:3000';
            const url = await this.ssoService.getSamlAuthorizeUrl(org, baseUrl);
            return res.redirect(url);
        } catch (error) {
            await this.alerts.alertOrg(
                org,
                'SAML SSO start failed',
                `SAML SSO start failed: ${error instanceof Error ? error.message : String(error)}`,
                { source: 'auth.saml', entityType: 'auth' },
            );
            return res.redirect(`${frontendUrl}/#/login?error=saml_config`);
        }
    }

    @Post('sso/saml/callback')
    async samlCallback(@Body() body: SamlCallbackDto, @Res() res: express.Response) {
        const frontendUrl = this.getFrontendUrl();
        try {
            const baseUrl = this.config.get<string>('API_URL') || 'http://localhost:3000';
            const { orgId, nameId, attributes } = await this.ssoService.validateSamlResponse(baseUrl, body as Record<string, string>);
            const user = await this.ssoService.findOrCreateUserFromSaml(orgId, { nameId, attributes });
            const loginResult = await this.authService.login(user);
            const accessToken = 'accessToken' in loginResult ? (loginResult.accessToken as string) : '';
            return res.redirect(`${frontendUrl}/#/auth/callback?token=${encodeURIComponent(accessToken)}`);
        } catch (error) {
            const relayState = body.RelayState || body.relayState;
            if (relayState) {
                await this.alerts.alertOrg(
                    relayState,
                    'SAML SSO callback failed',
                    `SAML SSO callback failed: ${error instanceof Error ? error.message : String(error)}`,
                    { source: 'auth.saml', entityType: 'auth' },
                );
            }
            return res.redirect(`${frontendUrl}/#/login?error=saml_login_failed`);
        }
    }

    private getFrontendUrl(): string {
        return this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    }
}
