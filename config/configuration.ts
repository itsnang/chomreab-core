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

  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
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
    },
  };
};
