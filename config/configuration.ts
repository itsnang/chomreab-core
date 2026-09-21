/** The deployment's own public base URL, used to tell Telegram where to
 *  deliver updates. An explicit value wins; otherwise fall back to the
 *  hosting platform's injected domain, so a standard deploy needs no extra
 *  configuration. Deliberately never derived from a request's `Host` header:
 *  a spoofed header would point a school's bot at someone else's server. */
const resolvePublicUrl = (): string | null => {
  const explicit = process.env.PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const platformDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (platformDomain) return `https://${platformDomain.replace(/\/+$/, '')}`;

  // Neither set: local development. Webhook registration is skipped entirely
  // and `scripts/tunnel.sh` keeps ownership of the webhook.
  return null;
};

const required = (name: string): string => {
  const v = process.env[name];
  if (!v || v.length < 32) {
    throw new Error(`${name} must be set to a strong random value (>=32 chars)`);
  }
  return v;
};

export default () => {
  const accessSecret = required('JWT_ACCESS_SECRET');
  const refreshSecret = required('JWT_REFRESH_SECRET');
  // Its own secret, never shared with the School-scoped access/refresh pair —
  // an Operator token verified against the wrong secret would just fail, but
  // sharing a secret invites someone eventually reusing the signing call
  // between the two paths, which is exactly the mistake ADR-0009 exists to
  // rule out structurally.
  const operatorSecret = required('JWT_OPERATOR_SECRET');

  if (new Set([accessSecret, refreshSecret, operatorSecret]).size !== 3) {
    throw new Error('JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and JWT_OPERATOR_SECRET must all be different');
  }

  const publicUrl = resolvePublicUrl();

  // Registering a webhook without a secret is worse than not registering one:
  // the webhook controller requires the secret on every update, so Telegram
  // would deliver successfully and this deployment would fail every single
  // one — silently, from the school's point of view. Refuse to boot instead,
  // the same way a weak JWT secret is refused above. Conditional on a public
  // URL so local development is untouched.
  if (publicUrl && !process.env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error(
      'TELEGRAM_WEBHOOK_SECRET must be set when the deployment has a public ' +
        `URL (${publicUrl}). Without it every Telegram update is rejected.`,
    );
  }

  // A missing webhook secret still fails *closed* (timingSafeEqual against
  // an empty buffer never matches), so this isn't a security gap the way a
  // missing Telegram secret would be — but a deployment that's configured to
  // take real payments and silently can never confirm one is its own kind of
  // outage, just a quiet one. Only required once CUTLUY_API_KEY is actually
  // set, so local development stays untouched.
  if (process.env.CUTLUY_API_KEY && !process.env.CUTLUY_WEBHOOK_SECRET) {
    throw new Error(
      'CUTLUY_WEBHOOK_SECRET must be set alongside CUTLUY_API_KEY — without ' +
        'it, every CutLuy payment webhook is rejected and no payment is ever confirmed.',
    );
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    publicUrl,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      // One shared bot for every School (ADR-0007) — there is no per-school
      // override any more, so the username is a deployment constant like the
      // token itself, not something fetched and cached per row.
      botUsername: process.env.TELEGRAM_BOT_USERNAME,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
      /** Where Telegram should deliver updates, or null when this deployment
       *  is not publicly reachable and registration must be skipped. */
      webhookUrl: publicUrl ? `${publicUrl}/telegram/webhook` : null,
    },
    database: {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      name: process.env.DB_NAME ?? 'attendance',
    },
    jwt: {
      accessSecret,
      accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
      refreshSecret,
      refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
      operatorSecret,
    },
    email: {
      // No key configured: EmailService logs instead of sending, so local
      // development and a demo never need a real provider account.
      resendApiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.EMAIL_FROM ?? 'Chomreab <noreply@chomreab.com>',
    },
    // Where a person actually clicks — the admin web app, not this API.
    // Verification and password-reset links point here.
    adminAppUrl: (process.env.ADMIN_APP_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
    cutluy: {
      apiKey: process.env.CUTLUY_API_KEY,
      webhookSecret: process.env.CUTLUY_WEBHOOK_SECRET,
      baseUrl: (process.env.CUTLUY_BASE_URL ?? 'https://cutluy.com').replace(/\/+$/, ''),
    },
  };
};
