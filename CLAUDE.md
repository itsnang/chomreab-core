# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev       # watch mode
docker compose up -d    # start Postgres (required before starting the app; host port 5433)

# Build & lint
npm run build
npm run lint

# Tests
npm test                          # unit tests (test/unit/)
npm run test:e2e                  # e2e tests (test/integration/)
npm test -- --testPathPattern=auth   # run tests for a single module
npm run test:cov                  # coverage report
```

The app reads DB credentials from `.env`. Docker Compose expects `PG_USER`, `PG_PASSWORD`, `PG_DBNAME`.

## Architecture

This is a **modular monolith** built on NestJS with CQRS (`@nestjs/cqrs`) and TypeORM + PostgreSQL.

### Module layout

Each domain lives under `src/<module>/` and is fully self-contained:

```
src/<module>/
  api/
    controllers/      ← HTTP handlers, inject CommandBus / QueryBus
    dto/              ← request DTOs with class-validator decorators
  application/
    commands/         ← command classes + ICommandHandler implementations
    queries/          ← query classes + IQueryHandler implementations
    events/           ← IEventHandler implementations (async side-effects)
    interfaces/       ← repository port interfaces (abstractions)
  domain/
    entities/         ← aggregate roots (only for modules with real business rules)
    value-objects/    ← value objects
    events/           ← domain event classes (published by aggregates/handlers)
  infrastructure/
    entities/         ← TypeORM @Entity classes
    repositories/     ← repository interface implementations
    mappers/          ← domain ↔ persistence mapping
    services/         ← external service integrations
  <module>.module.ts
```

Simple CRUD modules (`classroom`, `student`, `parent-link`) skip `domain/` and use the TypeORM entity directly in handlers. `attendance` uses full layering (edit history / audit log is real business logic).

Current modules: `auth` (admin/teacher login, refresh, password reset), `notification` (Telegram bot: outbound messages + webhook for parent `/start`, `/link`, `/status`), `shared` (global cross-cutting). Domain modules to add: `classroom`, `student`, `attendance`, `parent-link`.

### Root files

| File | Purpose |
|---|---|
| `src/main.ts` | Bootstrap: `ValidationPipe`, global interceptors/filters, Swagger |
| `src/app.module.ts` | Root module — imports `ConfigModule`, `TypeOrmModule.forRootAsync`, `SharedModule`, and all feature modules |
| `src/typeorm.config.ts` | TypeORM factory; uses `autoLoadEntities: true` — no need to list entities here |
| `config/configuration.ts` | Environment config factory (database, JWT, Telegram bot token) — fails fast at boot if JWT secrets are missing/weak |

### SharedModule

`src/shared/` is `@Global()` — registered once in `AppModule`, available everywhere without explicit imports.

Provides:
- `UserEntity` (`users` table) — `role: UserRole.ADMIN | UserRole.TEACHER`. There is no "parent" role: parents only interact via the Telegram bot, never log in.
- `JwtAuthGuard` / `RolesGuard` / `AdminGuard`, `@Roles()` / `@CurrentUser()` decorators
- `UserExistenceValidator` (async class-validator constraint)

### Inter-module communication

**Synchronous**: export the service from the provider module, import that module in the consumer module, inject directly.

**Asynchronous** (e.g., attendance marked → notify parent): publish a domain event via `EventBus`. The event class lives in `src/<publisher>/domain/events/`. The subscriber module imports that event class type and registers an `@EventsHandler`. Example: `notification`'s `TelegramService` is injected via the `TELEGRAM_SERVICE` DI token (see `src/notification/application/interfaces/telegram.service.ts`) — `sendMessage(chatId, text)` takes a per-recipient chat id (parent chat ids come from `ParentLink` records, there is no single global chat id).

### CQRS flow

```
Controller → CommandBus.execute(cmd) → ICommandHandler
                                          ↓ domain logic
                                          ↓ repository.save()
                                          ↓ eventBus.publish(domainEvent)
                                                ↓
                                         IEventHandler (side-effects)

Controller → QueryBus.execute(query) → IQueryHandler → read repository → DTO
```

Handlers, repositories, and services are registered as `providers` in the feature module. Repository interfaces are bound to implementations via `{ provide: TOKEN, useClass: Impl }`.

### TypeScript notes

- `noImplicitAny` is off — avoid `any` types anyway (enforced by global CLAUDE.md rule)
- `strictNullChecks` is on
- Module system is `nodenext` — use `.js` extensions in relative imports if you hit resolution errors
- `emitDecoratorMetadata` is on (required for NestJS DI and TypeORM decorators)
