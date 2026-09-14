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
2. Generate a webhook secret and put it in `TELEGRAM_WEBHOOK_SECRET` (e.g. `openssl rand -hex 16`) — this is a password you invent, not something Telegram gives you; it just has to match what you register with Telegram in the next step.
3. Install [ngrok](https://ngrok.com/download) if you don't have it, and run `ngrok config add-authtoken <token>` once (from your ngrok.com dashboard) — this saves to your machine's own ngrok config, never committed.
4. `npm run tunnel` — starts a tunnel to `localhost:8091` (config in the committed `ngrok.yml`, merged with your machine's authtoken) and registers the resulting URL as the Telegram webhook automatically. Leave it running; `Ctrl+C` stops the tunnel.

   The free tier hands out a new random `*.ngrok-free.dev` subdomain each run, so the script re-registers the webhook every time rather than assuming a fixed URL — no manual `curl` step needed.
5. Message your bot on Telegram: `/start`, then `/link <code>` using a code generated from the admin dashboard's Students screen — or tap the invite link the Linking codes screen generates once a bot token is saved in Settings.
