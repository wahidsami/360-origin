import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from '../common/prisma.service';
import { OperationalAlertsService } from '../common/operational-alerts.service';

@Injectable()
export class EmailService {
    private resend: Resend | null = null;
    private readonly logger = new Logger(EmailService.name);
    private readonly fromEmail: string;
    private readonly frontendUrl: string | null;

    constructor(
        private configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly alerts: OperationalAlertsService,
    ) {
        const apiKey = this.configService.get<string>('RESEND_API_KEY');
        this.fromEmail =
            this.configService.get<string>('EMAIL_FROM') ||
            this.configService.get<string>('RESEND_FROM_EMAIL') ||
            'onboarding@resend.dev';
        const frontendUrl = this.configService.get<string>('FRONTEND_URL')?.trim();
        this.frontendUrl = frontendUrl ? frontendUrl.replace(/\/+$/, '') : null;

        if (apiKey && apiKey.startsWith('re_')) {
            this.resend = new Resend(apiKey);
            this.logger.log('EmailService initialized with Resend');
        } else {
            this.logger.warn('RESEND_API_KEY missing or invalid. EmailService running in DEV mode (Console Log only).');
        }
    }

    private async alertDeliveryFailure(to: string, title: string, detail: string, source: string) {
        const recipient = await this.prisma.user.findFirst({
            where: { email: to.toLowerCase() },
            select: { orgId: true },
        });
        await this.alerts.alertOrg(recipient?.orgId, title, detail, {
            source,
            entityType: 'email',
            metadata: { to },
        });
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private normalizeLinkUrl(linkUrl?: string): string | undefined {
        if (!linkUrl) return undefined;
        const trimmed = linkUrl.trim();
        if (!trimmed) return undefined;
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if (!this.frontendUrl) return trimmed;
        return `${this.frontendUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
    }

    private buildEmailShell(title: string, eyebrow: string, body: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>${title}</title>
                </head>
                <body style="margin:0; padding:0; background-color:#eef2ff; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%); margin:0; padding:32px 16px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;">
                                    <tr>
                                        <td style="padding-bottom:16px; text-align:center;">
                                            <div style="display:inline-block; padding:8px 14px; border-radius:999px; background-color:#dbeafe; color:#1d4ed8; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
                                                ${eyebrow}
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="background-color:#ffffff; border:1px solid #dbe4f0; border-radius:28px; padding:40px 36px; box-shadow:0 18px 50px rgba(15, 23, 42, 0.10);">
                                            ${body}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:18px 12px 0; text-align:center; color:#64748b; font-size:12px; line-height:1.7;">
                                            Arena360 secure workspace access
                                            <br />
                                            If the button does not open, copy the link below into your browser.
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `;
    }

    private buildNotificationEmail(title: string, body?: string, linkUrl?: string, orgName: string = 'Arena360'): { html: string; text: string } {
        const resolvedLink = this.normalizeLinkUrl(linkUrl);
        const safeTitle = this.escapeHtml(title);
        const safeBody = this.escapeHtml(body || 'You have a new update in Arena360.');
        const safeLink = resolvedLink ? this.escapeHtml(resolvedLink) : '';
        const html = this.buildEmailShell(
            `${safeTitle} | ${orgName}`,
            'Arena360 Notification',
            `
                <div style="margin-bottom:28px;">
                    <div style="width:56px; height:56px; border-radius:18px; background:linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color:#ffffff; font-size:24px; font-weight:800; line-height:56px; text-align:center; margin-bottom:20px;">A</div>
                    <h1 style="margin:0 0 12px; font-size:34px; line-height:1.15; color:#0f172a;">${safeTitle}</h1>
                    <p style="margin:0; font-size:16px; line-height:1.7; color:#475569;">${safeBody}</p>
                </div>
                ${resolvedLink ? `
                    <div style="margin-bottom:24px;">
                        <a href="${safeLink}" style="display:inline-block; background:linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%); color:#ffffff; text-decoration:none; font-size:16px; font-weight:700; padding:15px 26px; border-radius:14px;">
                            Open in Arena360
                        </a>
                    </div>
                    <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:18px 20px; font-size:13px; line-height:1.7; word-break:break-all;">
                        <a href="${safeLink}" style="color:#2563eb; text-decoration:none;">${safeLink}</a>
                    </div>
                ` : ''}
            `,
        );

        const text = [
            `${title}`,
            '',
            body || 'You have a new update in Arena360.',
            resolvedLink ? '' : null,
            resolvedLink || null,
        ].filter(Boolean).join('\n');

        return { html, text };
    }

    private buildInviteEmail(to: string, inviteLink: string, orgName: string): { html: string; text: string } {
        const safeOrgName = this.escapeHtml(orgName);
        const safeInviteLink = this.escapeHtml(inviteLink);
        const safeRecipient = this.escapeHtml(to);

        const html = this.buildEmailShell(
            `Invitation to join ${safeOrgName}`,
            'Arena360 Invitation',
            `
                <div style="margin-bottom:28px;">
                    <div style="width:56px; height:56px; border-radius:18px; background:linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color:#ffffff; font-size:24px; font-weight:800; line-height:56px; text-align:center; margin-bottom:20px;">A</div>
                    <h1 style="margin:0 0 12px; font-size:34px; line-height:1.15; color:#0f172a;">You’re invited to join ${safeOrgName}</h1>
                    <p style="margin:0; font-size:16px; line-height:1.7; color:#475569;">
                        Hi ${safeRecipient}, your Arena360 workspace is ready. Use the secure invitation below to activate your account and start collaborating with your team.
                    </p>
                </div>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:22px;">
                    <tr>
                        <td style="padding:22px 22px 8px;">
                            <div style="font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#2563eb; margin-bottom:10px;">What happens next</div>
                            <div style="font-size:15px; line-height:1.8; color:#334155;">
                                1. Open your invitation link<br />
                                2. Set your password and complete account setup<br />
                                3. Access your workspace and assigned client context
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:8px 22px 22px;">
                            <a href="${safeInviteLink}" style="display:inline-block; background:linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%); color:#ffffff; text-decoration:none; font-size:16px; font-weight:700; padding:15px 26px; border-radius:14px;">
                                Accept Invitation
                            </a>
                        </td>
                    </tr>
                </table>

                <div style="margin-bottom:24px;">
                    <div style="font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#475569; margin-bottom:10px;">Direct link</div>
                    <div style="background-color:#0f172a; color:#e2e8f0; border-radius:18px; padding:18px 20px; font-size:13px; line-height:1.7; word-break:break-all;">
                        <a href="${safeInviteLink}" style="color:#93c5fd; text-decoration:none;">${safeInviteLink}</a>
                    </div>
                </div>

                <div style="padding:18px 20px; border-radius:18px; background-color:#eff6ff; border:1px solid #bfdbfe; color:#1e3a8a; font-size:14px; line-height:1.7;">
                    This invitation expires in <strong>72 hours</strong>. If you were not expecting this email, you can ignore it safely.
                </div>
            `,
        );

        const text = [
            `You're invited to join ${orgName} on Arena360.`,
            '',
            `Hi ${to},`,
            '',
            'Your workspace is ready. Open the secure link below to activate your account and finish setup:',
            inviteLink,
            '',
            'This invitation expires in 72 hours.',
            'If you were not expecting this email, you can ignore it safely.',
        ].join('\n');

        return { html, text };
    }

    async sendInvite(to: string, inviteLink: string, orgName: string = 'Arena360'): Promise<void> {
        const subject = `You've been invited to join ${orgName}`;
        const { html, text } = this.buildInviteEmail(to, inviteLink, orgName);

        if (this.resend) {
            try {
                const response = await this.resend.emails.send({
                    from: this.fromEmail,
                    to,
                    subject,
                    html,
                    text,
                });
                if (response.error) {
                    this.logger.error(`Failed to send invite email to ${to}: ${response.error.message}`);
                    throw new BadGatewayException(response.error.message || 'Invite email send failed');
                }
                this.logger.log(`Invite email sent to ${to}${response.data?.id ? ` (id: ${response.data.id})` : ''}`);
            } catch (error) {
                this.logger.error(`Failed to send invite email to ${to}:`, error);
                await this.alertDeliveryFailure(
                    to,
                    'Invite email delivery failed',
                    `Invite email delivery failed for ${to}: ${error instanceof Error ? error.message : String(error)}`,
                    'email.invite',
                );
                throw error; // Or swallow if we don't want to block user creation
            }
        } else {
            // DEV Mode
            this.logger.log('================ [DEV] EMAIL PREVIEW ================');
            this.logger.log(`TO: ${to}`);
            this.logger.log(`SUBJECT: ${subject}`);
            this.logger.log(`LINK: ${inviteLink}`);
            this.logger.log('=====================================================');
        }
    }

    async sendPasswordReset(to: string, resetLink: string, orgName: string = 'Arena360'): Promise<void> {
        const subject = `Reset your ${orgName} password`;
        const html = `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h1>Reset your password</h1>
                <p>You requested a password reset for your <strong>${orgName}</strong> account on Arena360.</p>
                <p>Click the button below to choose a new password:</p>
                <a href="${resetLink}" style="display: inline-block; background-color: #06b6d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">Reset password</a>
                <p>or copy this link: <br> <a href="${resetLink}">${resetLink}</a></p>
                <p>This link will expire in 1 hour. If you didn't request this, you can ignore this email.</p>
            </div>
        `;
        if (this.resend) {
            try {
                const response = await this.resend.emails.send({
                    from: this.fromEmail,
                    to,
                    subject,
                    html,
                });
                if (response.error) {
                    this.logger.error(`Failed to send password reset email to ${to}: ${response.error.message}`);
                    throw new BadGatewayException(response.error.message || 'Password reset email send failed');
                }
                this.logger.log(`Password reset email sent to ${to}`);
            } catch (error) {
                this.logger.error(`Failed to send password reset email to ${to}:`, error);
                await this.alertDeliveryFailure(
                    to,
                    'Password reset email delivery failed',
                    `Password reset email delivery failed for ${to}: ${error instanceof Error ? error.message : String(error)}`,
                    'email.password-reset',
                );
                throw error;
            }
        } else {
            this.logger.log('================ [DEV] PASSWORD RESET EMAIL ================');
            this.logger.log(`TO: ${to}`);
            this.logger.log(`SUBJECT: ${subject}`);
            this.logger.log(`LINK: ${resetLink}`);
            this.logger.log('================================================================');
        }
    }

    async sendNotificationEmail(to: string, title: string, body?: string, linkUrl?: string, orgName: string = 'Arena360'): Promise<void> {
        const subject = `${orgName}: ${title}`;
        const resolvedLink = this.normalizeLinkUrl(linkUrl);
        const { html, text } = this.buildNotificationEmail(title, body, resolvedLink, orgName);

        if (this.resend) {
            try {
                const response = await this.resend.emails.send({
                    from: this.fromEmail,
                    to,
                    subject,
                    html,
                    text,
                });
                if (response.error) {
                    this.logger.error(`Failed to send notification email to ${to}: ${response.error.message}`);
                    throw new BadGatewayException(response.error.message || 'Notification email send failed');
                }
                this.logger.log(`Notification email sent to ${to}${response.data?.id ? ` (id: ${response.data.id})` : ''}`);
            } catch (error) {
                this.logger.error(`Failed to send notification email to ${to}:`, error);
                await this.alertDeliveryFailure(
                    to,
                    'Notification email delivery failed',
                    `Notification email delivery failed for ${to}: ${error instanceof Error ? error.message : String(error)}`,
                    'email.notification',
                );
                throw error;
            }
        } else {
            this.logger.log('================ [DEV] NOTIFICATION EMAIL ================');
            this.logger.log(`TO: ${to}`);
            this.logger.log(`SUBJECT: ${subject}`);
            this.logger.log(`TITLE: ${title}`);
            this.logger.log(`BODY: ${body || ''}`);
            this.logger.log(`LINK: ${resolvedLink || ''}`);
            this.logger.log('=========================================================');
        }
    }
}
