# Attendance API

Backend for a school/tutoring-center attendance system: teacher attendance marking, a Telegram bot for parent notifications, and an admin dashboard API. Cloned from `hang-neak-api`'s stack/conventions (NestJS 11 + CQRS + TypeORM + PostgreSQL).

## Tech Stack

- NestJS 11, `@nestjs/cqrs` (CommandBus/QueryBus/EventBus)
- TypeORM + PostgreSQL, `SnakeNamingStrategy` (camelCase in code → snake_case columns), `synchronize: true` (no migrations yet)
- Hand-rolled JWT auth (access + refresh), no Passport
- class-validator / class-transformer, `@nestjs/swagger`
- Jest (unit) + Supertest (e2e)

## Response envelope

Every response is wrapped: `{ code, message, data }` on success, `{ code, message, data: null }` on error (see `src/shared/interceptors` and `src/shared/filters`).

## Setup

```bash
cp .env.example .env   # fill in JWT secrets (>=32 chars each, must differ) and TELEGRAM_BOT_TOKEN
docker compose up -d   # Postgres on host port 5433
npm install
npm run start:dev      # http://localhost:8091, Swagger at /api if ENABLE_SWAGGER=true
npm run seed           # creates admin@attendance.dev / teacher@attendance.dev (password123)
```

## Commands

```bash
npm run start:dev                     # watch mode
npm run build && npm run start:prod   # production build
npm run lint

npm test                              # unit tests (test/unit/)
npm test -- --testPathPattern=auth    # single module
npm run test:e2e                      # e2e tests (test/integration/)
npm run test:cov
```

See `CLAUDE.md` for architecture/module conventions.

## Telegram bot setup (for parent notifications)

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts. Copy the token into `TELEGRAM_BOT_TOKEN` in `.env`.
2. Generate a webhook secret and put it in `TELEGRAM_WEBHOOK_SECRET` (e.g. `openssl rand -hex 16`).
3. Expose your local API over HTTPS with a tunnel, e.g. `cloudflared tunnel --url http://localhost:8091` or `ngrok http 8091`. Note the public HTTPS URL it prints.
4. Register the webhook with Telegram:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -H 'Content-Type: application/json' \
     -d '{"url": "<TUNNEL_URL>/telegram/webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
5. Message your bot on Telegram: `/start`, then `/link <code>` using a code generated from the admin dashboard's Students screen.
