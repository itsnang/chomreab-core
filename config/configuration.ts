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
  };
};
