import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends via Resend when `RESEND_API_KEY` is configured; otherwise logs the
 * would-be email at warn level and returns as if it succeeded.
 *
 * The fallback isn't a placeholder to delete later — it's what keeps local
 * development and a fresh deploy usable before anyone has set up a real
 * provider account, the same way `TELEGRAM_BOT_TOKEN` and CutLuy's own key
 * are optional until a school actually needs them. Signup and password reset
 * both work either way; only where the email *goes* differs.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = `${this.configService.get<string>('adminAppUrl')}/reset-password?token=${token}`;
    await this.send({
      to: email,
      subject: 'Reset your Chomreab password',
      html: `<p>Click the link below to choose a new password. This link expires in an hour.</p><p><a href="${url}">${url}</a></p>`,
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${this.configService.get<string>('adminAppUrl')}/verify-email?token=${token}`;
    await this.send({
      to: email,
      subject: 'Verify your Chomreab account',
      html: `<p>One more step — confirm this address to start your trial.</p><p><a href="${url}">${url}</a></p>`,
    });
  }

  private async send(message: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const apiKey = this.configService.get<string>('email.resendApiKey');
    if (!apiKey) {
      this.logger.warn(
        `No RESEND_API_KEY configured — logging instead of sending. To: ${message.to} | Subject: ${message.subject} | ${message.html}`,
      );
      return;
    }

    const from = this.configService.get<string>('email.fromAddress');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // Never block the caller's own flow on an email provider hiccup — the
      // token this backs is still valid and the person can ask for another
      // one. Logged so a real outage is at least visible.
      this.logger.error(
        `Resend rejected an email to ${message.to}: ${response.status} ${await response.text()}`,
      );
    }
  }
}
