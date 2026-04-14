import { BadGatewayException, Injectable } from '@nestjs/common';

@Injectable()
export class SlackService {
  async sendToWebhook(webhookUrl: string, payload: { text?: string; blocks?: unknown[] }) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new BadGatewayException(`Slack webhook failed: ${res.status} ${body}`);
    }
    return true;
  }

  async notify(webhookUrl: string, title: string, body?: string, linkUrl?: string) {
    const text = linkUrl ? `${title}\n${body || ''}\n<${linkUrl}|Open in Arena360>` : `${title}\n${body || ''}`;
    return this.sendToWebhook(webhookUrl, { text });
  }
}
