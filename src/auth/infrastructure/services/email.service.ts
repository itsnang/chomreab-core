import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BRAND_COLOR = '#4f7fe0';
const INK_COLOR = '#16181d';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e5e7eb';

/**
 * A single table-based layout shared by every transactional email, styled to
 * match the admin app's card/button look. Table-based, inline-styled markup
 * is deliberate — it's the one layout approach that survives Gmail/Outlook's
 * CSS stripping, not a stylistic choice.
 */
function renderEmail(options: {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}): string {
  const { preheader, heading, body, ctaLabel, ctaUrl, footerNote } = options;
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border:1px solid ${BORDER_COLOR};border-radius:12px;">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <span style="font-size:17px;font-weight:700;color:${INK_COLOR};">Chomreab</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:800;color:${INK_COLOR};">${heading}</h1>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:${MUTED_COLOR};">${body}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:${BRAND_COLOR};">
                      <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED_COLOR};">
                  Or paste this link into your browser:<br />
                  <a href="${ctaUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${ctaUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED_COLOR};border-top:1px solid ${BORDER_COLOR};padding-top:16px;">${footerNote}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

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
      html: renderEmail({
        preheader: 'Choose a new password for your Chomreab account.',
        heading: 'Reset your password',
        body: 'Click the button below to choose a new password. This link expires in an hour and works once.',
        ctaLabel: 'Reset password',
        ctaUrl: url,
        footerNote: "If you didn't request this, you can safely ignore this email — your password won't change.",
      }),
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${this.configService.get<string>('adminAppUrl')}/verify-email?token=${token}`;
    await this.send({
      to: email,
      subject: 'Verify your Chomreab account',
      html: renderEmail({
        preheader: 'Confirm your email to start your 30-day Chomreab trial.',
        heading: 'Confirm your email',
        body: 'One more step — confirm this address to start your 30-day trial. This link expires in 24 hours.',
        ctaLabel: 'Verify email',
        ctaUrl: url,
        footerNote: "If you didn't create a Chomreab account, you can safely ignore this email.",
      }),
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
