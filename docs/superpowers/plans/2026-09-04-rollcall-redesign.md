# Rollcall Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Rollcall" design (`Rollcall.dc.html`, Claude Design project `bf281db1-4f76-46d4-8198-8fa4b8b233b5`) end-to-end: new blue-based design tokens, a redesigned teacher attendance dashboard (class sidebar, stat ledger, per-student notes, audit log), and four new admin screens (Linking codes, Staff, Reports, Settings) — the last three backed by brand-new backend modules.

**Architecture:** Two repos, two worktrees. Backend (`attendance-api`, NestJS/CQRS/TypeORM) gets four new/extended feature modules following the existing simple-CRUD-module pattern (`classroom`-style: command/query handlers as CQRS providers, `Repository.find()`-based in-memory joins, no `createQueryBuilder`). Frontend (`attendance-admin`, Next.js/shadcn) gets new feature slices following the existing `classrooms`/`students`/`attendance` pattern (`'use server'` actions returning `{error?}`, TanStack Query hooks, snake_case↔camelCase mappers) plus a full token/nav redesign.

**Tech Stack:** Backend — NestJS 11, `@nestjs/cqrs`, TypeORM (`synchronize: true`, no migrations), PostgreSQL, Jest. Frontend — Next.js 16 App Router, React 19, Tailwind v4 (CSS-only config, no `tailwind.config.ts`), shadcn/ui "new-york", TanStack Query v5, React Hook Form + Zod v4, `next/font/google`.

**Spec:** Claude Design project `bf281db1-4f76-46d4-8198-8fa4b8b233b5` (`Rollcall.dc.html` + `design_handoff_attendance_app/README.md`, fetched via the `DesignSync` MCP tool). The handoff README is the authoritative prose spec (screens, tokens, copy); `Rollcall.dc.html` is the literal prototype markup (do not port its template syntax — it uses a proprietary `x-dc`/`sc-if`/`sc-for` runtime, not real React). `ios-frame.jsx` is a phone-bezel mockup helper only, not part of the real UI, and is not used by this plan.

## Global Constraints

- Colors (light mode, exact from spec): primary blue `#0066CC`, ink `#101010`, page background `#F7F7F5`, card background `#FFFFFF`, border `#E6E6E2`, hairline/divider `#ECECE8`, muted text `#7A7A78`, success `#2E7D4F` (bg tint `#E4EFE8`), danger `#A8433F` (bg tint `#F5E3E1`), neutral/late `#5B5955` (bg tint `#ECECE8`). Dark-mode values are **not specified by the source** (the prototype is light-only) — this plan extrapolates a consistent dark palette (see Task 5); flagged as a deliberate addition, not a spec requirement.
- Fonts: Plus Jakarta Sans (already installed) for all UI text; **IBM Plex Mono** (new) for all numbers, codes, and timestamps — exact spec requirement ("Monospace (codes, stat numbers, timestamps): IBM Plex Mono (500/600)").
- Radii/shadows (exact from spec): card radius 16–20px, buttons/inputs 9–11px, pills/chips fully round (999px). Card shadow `0 1px 2px rgba(16,16,16,.03), 0 8-24px rgba(16,16,16,.04-.05)`. Primary-button shadow `0 4px 12px rgba(0,102,204,.25-.28)`.
- Avatar color rotation (exact from spec, `avatarColor(id)` in the prototype): `["#0066CC", "#4B6B8A", "#46935E", "#C2605F"]`, indexed by a hash of the entity's id, white initials text.
- Copy is final per the spec ("Fidelity: High-fidelity... copy below are final as designed") — use exact strings given in Global Constraints and each task, except where a task explicitly notes an adaptation forced by this app's real data model (see each task's "Deviation" notes).
- **Deliberate scope deviations from the literal prototype**, applying throughout: (1) the prototype's "Teacher / Admin" role-switch pill and "Desktop / Phone" preview toggle are demo-only UI for the click-through mockup — the real app already role-gates via login, so neither is implemented; (2) the prototype batches all marks locally then sends one "Save & notify parents" action — the real backend already persists and notifies **per mark** (existing `MarkAttendanceCommand` → `AttendanceMarkedEvent` → Telegram send), so there is no batch-save step; a small always-visible notice replaces the save button (Task 6); (3) the prototype's Telegram bot-token field round-trips the live secret to client-side state — this plan never sends the real token to the browser, only whether one is configured (Task 11); (4) the prototype's "What parents get on Telegram" preview panel (phone-view companion) is decorative demo content with no backing data model — not implemented.
- Backend convention (verified, no exceptions): every module gets its own `TypeOrmModule.forFeature([...])` listing every entity it directly injects, even entities "owned" by another module (e.g. `attendance.module.ts` already lists `StudentEntity` directly) — do not rely on `SharedModule`'s global export as the only source for `UserEntity`, list it explicitly too. DTOs use snake_case field names via `class-validator`; commands/entities use camelCase. Every admin-only controller/route uses `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` (class-level when the whole controller is admin-only, per-method otherwise), matching `parent-links.controller.ts` and `classrooms.controller.ts`.
- Frontend convention (verified, no exceptions): every `'use server'` action file exports one `list*`/`get*` function returning the plain domain type (or throwing, caught by the caller... no — **actions never throw**, they catch `ApiError` internally) and one function per mutation returning `Promise<{error?: string}>`; every list/detail action has a private `*Api` interface (snake_case) and a `to*()` mapper; hooks are `'use client'` one-liners wrapping `useQuery`; screens invalidate via `useQueryClient().invalidateQueries({queryKey:[...]})`, never `router.refresh()`.

---

## Task 1: School Settings module (backend)

**Files:**
- Create: `src/school-settings/infrastructure/entities/school-settings.entity.ts`
- Create: `src/school-settings/application/queries/get-school-settings.query.ts`
- Create: `src/school-settings/application/queries/get-school-settings.handler.ts`
- Create: `src/school-settings/application/commands/update-school-settings.command.ts`
- Create: `src/school-settings/application/commands/update-school-settings.handler.ts`
- Create: `src/school-settings/application/services/school-settings.service.ts`
- Create: `src/school-settings/api/dto/update-school-settings.dto.ts`
- Create: `src/school-settings/api/controllers/school-settings.controller.ts`
- Create: `src/school-settings/school-settings.module.ts`
- Modify: `src/app.module.ts` (register `SchoolSettingsModule`)
- Modify: `src/notification/infrastructure/services/telegram.service.ts` (resolve bot token per-call, not at construction)
- Modify: `src/notification/notification.module.ts` (import `SchoolSettingsModule`)
- Modify: `src/notification/application/events/attendance-marked-notification.handler.ts` (use the saved absence template for `status === 'absent'`)
- Test: `test/unit/school-settings/school-settings.spec.ts`

**Interfaces:**
- Produces: `SchoolSettingsService.getEffectiveBotToken(): Promise<string | undefined>`, `SchoolSettingsService.getAbsenceTemplate(): Promise<string>` — both exported from `SchoolSettingsModule`, consumed by `NotificationModule`.
- Produces: `GET /school-settings`, `PATCH /school-settings` (admin only).

**Deviation:** the spec's `{{parent_name}}` template placeholder has no backing field in this app's data model (`ParentLinkEntity` stores only a Telegram chat id, no guardian name) — only `{{student_name}}` is supported. The template customization applies only to the `absent` status message; `present`/`late` keep the existing hardcoded format (matches the setting's actual name, "Absence message template").

- [ ] **Step 1: Write the entity**

```ts
// src/school-settings/infrastructure/entities/school-settings.entity.ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const SCHOOL_SETTINGS_ID = 'default';

export const DEFAULT_SCHOOL_SETTINGS = {
  schoolName: 'My School',
  lateCutoffMinutes: 15,
  absenceMessageTemplate:
    '{{student_name}} was marked absent today with no note on file.',
  telegramBotToken: null as string | null,
};

@Entity('school_settings')
export class SchoolSettingsEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  schoolName: string;

  @Column({ type: 'int' })
  lateCutoffMinutes: number;

  @Column({ type: 'text' })
  absenceMessageTemplate: string;

  @Column({ type: 'varchar', nullable: true })
  telegramBotToken: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/unit/school-settings/school-settings.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { GetSchoolSettingsHandler } from '../../../src/school-settings/application/queries/get-school-settings.handler';
import { GetSchoolSettingsQuery } from '../../../src/school-settings/application/queries/get-school-settings.query';
import { UpdateSchoolSettingsHandler } from '../../../src/school-settings/application/commands/update-school-settings.handler';
import { UpdateSchoolSettingsCommand } from '../../../src/school-settings/application/commands/update-school-settings.command';
import { SchoolSettingsService } from '../../../src/school-settings/application/services/school-settings.service';
import {
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../../src/school-settings/infrastructure/entities/school-settings.entity';

describe('School settings', () => {
  let getHandler: GetSchoolSettingsHandler;
  let updateHandler: UpdateSchoolSettingsHandler;
  let service: SchoolSettingsService;
  let repo: { create: jest.Mock; save: jest.Mock; findOneBy: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v: Partial<SchoolSettingsEntity>) => v as SchoolSettingsEntity),
      save: jest.fn((v: SchoolSettingsEntity) => Promise.resolve(v)),
      findOneBy: jest.fn(),
    };
    configService = { get: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetSchoolSettingsHandler,
        UpdateSchoolSettingsHandler,
        SchoolSettingsService,
        { provide: getRepositoryToken(SchoolSettingsEntity), useValue: repo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    getHandler = module.get(GetSchoolSettingsHandler);
    updateHandler = module.get(UpdateSchoolSettingsHandler);
    service = module.get(SchoolSettingsService);
  });

  it('creates default settings on first read', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await getHandler.execute(new GetSchoolSettingsQuery());
    expect(result.id).toBe(SCHOOL_SETTINGS_ID);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('returns existing settings without re-saving', async () => {
    repo.findOneBy.mockResolvedValue({ id: SCHOOL_SETTINGS_ID, schoolName: 'Existing' });
    const result = await getHandler.execute(new GetSchoolSettingsQuery());
    expect(result.schoolName).toBe('Existing');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updates settings', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand('New School', 20, 'Absent: {{student_name}}', null),
    );
    expect(result.schoolName).toBe('New School');
    expect(result.lateCutoffMinutes).toBe(20);
  });

  it('preserves the existing bot token when none is provided in the update', async () => {
    repo.findOneBy.mockResolvedValue({ id: SCHOOL_SETTINGS_ID, telegramBotToken: 'existing-token' });
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand('New School', 20, 'Absent: {{student_name}}', null),
    );
    expect(result.telegramBotToken).toBe('existing-token');
  });

  it('overwrites the bot token when a new one is provided', async () => {
    repo.findOneBy.mockResolvedValue({ id: SCHOOL_SETTINGS_ID, telegramBotToken: 'old-token' });
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand('New School', 20, 'Absent: {{student_name}}', 'new-token'),
    );
    expect(result.telegramBotToken).toBe('new-token');
  });

  it('falls back to the env var when no bot token override is saved', async () => {
    repo.findOneBy.mockResolvedValue({ id: SCHOOL_SETTINGS_ID, telegramBotToken: null });
    configService.get.mockReturnValue('env-token');
    const token = await service.getEffectiveBotToken();
    expect(token).toBe('env-token');
  });

  it('prefers the saved bot token override over the env var', async () => {
    repo.findOneBy.mockResolvedValue({ id: SCHOOL_SETTINGS_ID, telegramBotToken: 'db-token' });
    const token = await service.getEffectiveBotToken();
    expect(token).toBe('db-token');
  });

  it('returns the default absence template when settings have never been saved', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const template = await service.getAbsenceTemplate();
    expect(template).toContain('{{student_name}}');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- test/unit/school-settings/school-settings.spec.ts`
Expected: FAIL (cannot find module `.../get-school-settings.handler` etc.)

- [ ] **Step 4: Implement the query, command, and service**

```ts
// src/school-settings/application/queries/get-school-settings.query.ts
export class GetSchoolSettingsQuery {}
```

```ts
// src/school-settings/application/queries/get-school-settings.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_SCHOOL_SETTINGS,
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';
import { GetSchoolSettingsQuery } from './get-school-settings.query';

@Injectable()
@QueryHandler(GetSchoolSettingsQuery)
export class GetSchoolSettingsHandler
  implements IQueryHandler<GetSchoolSettingsQuery, SchoolSettingsEntity>
{
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
  ) {}

  async execute(): Promise<SchoolSettingsEntity> {
    const existing = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    if (existing) return existing;
    return this.repository.save(
      this.repository.create({ id: SCHOOL_SETTINGS_ID, ...DEFAULT_SCHOOL_SETTINGS }),
    );
  }
}
```

```ts
// src/school-settings/application/commands/update-school-settings.command.ts
export class UpdateSchoolSettingsCommand {
  constructor(
    public readonly schoolName: string,
    public readonly lateCutoffMinutes: number,
    public readonly absenceMessageTemplate: string,
    public readonly telegramBotToken: string | null,
  ) {}
}
```

```ts
// src/school-settings/application/commands/update-school-settings.handler.ts
import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';
import { UpdateSchoolSettingsCommand } from './update-school-settings.command';

@Injectable()
@CommandHandler(UpdateSchoolSettingsCommand)
export class UpdateSchoolSettingsHandler
  implements ICommandHandler<UpdateSchoolSettingsCommand, SchoolSettingsEntity>
{
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
  ) {}

  async execute(command: UpdateSchoolSettingsCommand): Promise<SchoolSettingsEntity> {
    // A blank `telegramBotToken` in the command means "not provided" (the
    // admin left the field empty to keep the current secret), never "clear
    // it" — so fall back to whatever is already saved, not null.
    const existing = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    const settings = this.repository.create({
      id: SCHOOL_SETTINGS_ID,
      schoolName: command.schoolName,
      lateCutoffMinutes: command.lateCutoffMinutes,
      absenceMessageTemplate: command.absenceMessageTemplate,
      telegramBotToken: command.telegramBotToken ?? existing?.telegramBotToken ?? null,
    });
    return this.repository.save(settings);
  }
}
```

```ts
// src/school-settings/application/services/school-settings.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_SCHOOL_SETTINGS,
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';

@Injectable()
export class SchoolSettingsService {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
    private readonly configService: ConfigService,
  ) {}

  /** The bot token to send Telegram messages with: the admin-configured
   *  override if one has been saved, otherwise the TELEGRAM_BOT_TOKEN env var. */
  async getEffectiveBotToken(): Promise<string | undefined> {
    const row = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    return row?.telegramBotToken ?? this.configService.get<string>('telegram.botToken');
  }

  /** The saved absence-notification template, or the built-in default if
   *  settings have never been saved. Supports a single `{{student_name}}`
   *  placeholder. */
  async getAbsenceTemplate(): Promise<string> {
    const row = await this.repository.findOneBy({ id: SCHOOL_SETTINGS_ID });
    return row?.absenceMessageTemplate ?? DEFAULT_SCHOOL_SETTINGS.absenceMessageTemplate;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- test/unit/school-settings/school-settings.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Wire up the DTO, controller, and module**

```ts
// src/school-settings/api/dto/update-school-settings.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateSchoolSettingsDto {
  @ApiProperty({ example: 'Rise Tutoring Center' })
  @IsString()
  @MinLength(1)
  school_name: string;

  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(0)
  late_cutoff_minutes: number;

  @ApiProperty({ example: '{{student_name}} was marked absent today.' })
  @IsString()
  @MinLength(1)
  absence_message_template: string;

  @ApiProperty({ required: false, description: 'Leave unset to keep the current token' })
  @IsOptional()
  @IsString()
  telegram_bot_token?: string;
}
```

```ts
// src/school-settings/api/controllers/school-settings.controller.ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { UpdateSchoolSettingsDto } from '../dto/update-school-settings.dto';
import { GetSchoolSettingsQuery } from '../../application/queries/get-school-settings.query';
import { UpdateSchoolSettingsCommand } from '../../application/commands/update-school-settings.command';

@ApiTags('school-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('school-settings')
export class SchoolSettingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'Get the school settings (admin only)' })
  @Get()
  get() {
    return this.queryBus.execute(new GetSchoolSettingsQuery());
  }

  @ApiOperation({ summary: 'Update the school settings (admin only)' })
  @Patch()
  update(@Body() dto: UpdateSchoolSettingsDto) {
    return this.commandBus.execute(
      new UpdateSchoolSettingsCommand(
        dto.school_name,
        dto.late_cutoff_minutes,
        dto.absence_message_template,
        dto.telegram_bot_token ?? null,
      ),
    );
  }
}
```

```ts
// src/school-settings/school-settings.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolSettingsEntity } from './infrastructure/entities/school-settings.entity';
import { SchoolSettingsController } from './api/controllers/school-settings.controller';
import { GetSchoolSettingsHandler } from './application/queries/get-school-settings.handler';
import { UpdateSchoolSettingsHandler } from './application/commands/update-school-settings.handler';
import { SchoolSettingsService } from './application/services/school-settings.service';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([SchoolSettingsEntity]), JwtModule.register({})],
  controllers: [SchoolSettingsController],
  providers: [GetSchoolSettingsHandler, UpdateSchoolSettingsHandler, SchoolSettingsService],
  exports: [SchoolSettingsService],
})
export class SchoolSettingsModule {}
```

Modify `src/app.module.ts`: add `import { SchoolSettingsModule } from './school-settings/school-settings.module';` and add `SchoolSettingsModule` to the `imports` array (after `AttendanceModule`).

- [ ] **Step 7: Wire the bot token and absence template into notifications**

Replace the full content of `src/notification/infrastructure/services/telegram.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { SchoolSettingsService } from '../../../school-settings/application/services/school-settings.service';
import type { ITelegramService } from '../../application/interfaces/telegram.service';

@Injectable()
export class TelegramService implements ITelegramService {
  constructor(private readonly schoolSettings: SchoolSettingsService) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    const botToken = await this.schoolSettings.getEffectiveBotToken();
    if (!botToken) {
      throw new Error('No Telegram bot token configured');
    }
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
  }
}
```

In `src/notification/notification.module.ts`: add `import { SchoolSettingsModule } from '../school-settings/school-settings.module';` and add `SchoolSettingsModule` to the `imports` array.

Replace the full content of `src/notification/application/events/attendance-marked-notification.handler.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceMarkedEvent } from '../../../attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { escapeTelegramHtml } from '../../../shared/utils/telegram-escape.util';
import { SchoolSettingsService } from '../../../school-settings/application/services/school-settings.service';
import { TELEGRAM_SERVICE, type ITelegramService } from '../interfaces/telegram.service';

const STATUS_LABEL: Record<string, string> = {
  present: '✅ present',
  absent: '❌ absent',
  late: '⏰ late',
};

@Injectable()
@EventsHandler(AttendanceMarkedEvent)
export class AttendanceMarkedNotificationHandler implements IEventHandler<AttendanceMarkedEvent> {
  private readonly logger = new Logger(AttendanceMarkedNotificationHandler.name);

  constructor(
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
    private readonly schoolSettings: SchoolSettingsService,
  ) {}

  async handle(event: AttendanceMarkedEvent): Promise<void> {
    const links = await this.parentLinkRepository.find({ where: { studentId: event.studentId } });
    if (links.length === 0) return;

    const student = await this.studentRepository.findOneBy({ id: event.studentId });
    const studentName = escapeTelegramHtml(student?.name ?? 'Your child');
    const text = await this.buildMessage(event, studentName);

    for (const link of links) {
      try {
        await this.telegram.sendMessage(link.telegramChatId, text);
      } catch (error) {
        // Fire-and-forget: one parent's failed delivery shouldn't stop the
        // rest, but it must still be observable rather than silently lost.
        this.logger.error(
          `Failed to send attendance notification to chat ${link.telegramChatId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async buildMessage(event: AttendanceMarkedEvent, studentName: string): Promise<string> {
    if (event.status === 'absent') {
      // Escape the admin-authored template's own literal text once, then
      // substitute the already-escaped student name into its placeholder —
      // never re-escape studentName, or entities like `&amp;` double-encode.
      const template = await this.schoolSettings.getAbsenceTemplate();
      const escapedTemplate = escapeTelegramHtml(template);
      return escapedTemplate.replace(/\{\{\s*student_name\s*\}\}/g, studentName);
    }
    const label = STATUS_LABEL[event.status] ?? event.status;
    const noteText = event.note ? `\nNote: ${escapeTelegramHtml(event.note)}` : '';
    return `${studentName} was marked ${label} on ${event.date}.${noteText}`;
  }
}
```

- [ ] **Step 8: Run the full backend test suite and lint**

Run: `npm run lint && npm test`
Expected: lint clean; all suites pass, including the existing `attendance-marked-notification.handler.spec.ts` and `send-notification.handler.spec.ts` — if either fails because it constructs `TelegramService` directly or asserts on `ConfigService`, update that test's providers list to supply a mock `SchoolSettingsService` (`{ getEffectiveBotToken: jest.fn().mockResolvedValue('token'), getAbsenceTemplate: jest.fn().mockResolvedValue('...') }`) instead of `ConfigService`.

- [ ] **Step 9: Commit**

```bash
git add src/school-settings src/notification src/app.module.ts test/unit/school-settings
git commit -m "feat(school-settings): add settings module, wire bot token + absence template"
```

---

## Task 2: Staff (teacher accounts) admin CRUD (backend)

**Files:**
- Create: `src/staff/application/commands/create-teacher.command.ts`
- Create: `src/staff/application/commands/create-teacher.handler.ts`
- Create: `src/staff/application/commands/delete-teacher.command.ts`
- Create: `src/staff/application/commands/delete-teacher.handler.ts`
- Create: `src/staff/application/queries/get-teachers.query.ts`
- Create: `src/staff/application/queries/get-teachers.handler.ts`
- Create: `src/staff/api/dto/create-teacher.dto.ts`
- Create: `src/staff/api/controllers/staff.controller.ts`
- Create: `src/staff/staff.module.ts`
- Modify: `src/app.module.ts` (register `StaffModule`)
- Test: `test/unit/staff/staff.spec.ts`

**Interfaces:**
- Produces: `GET /staff` → `TeacherWithClassrooms[]` (`{id, name, email, classroomNames: string[]}`); `POST /staff` → `CreatedTeacher` (`{id, name, email, temporaryPassword}`); `DELETE /staff/:id`.
- Consumes: `UserEntity`/`UserRole` from `src/shared/entities/user.entity.ts` (reuses the existing user table — a "teacher" is a `UserEntity` with `role: UserRole.TEACHER`, no new user table). `ClassroomEntity` from `src/classroom/infrastructure/entities/classroom.entity.ts` (`teacherId` field, exact name confirmed).

**Note:** classroom assignment is **not** a Staff-module concern — a teacher is assigned to a classroom via the *existing* `PATCH /classrooms/:id` endpoint (`{teacher_id}`), reusing what's already built rather than duplicating assignment logic here. The frontend (Task 9) calls both endpoints in sequence when the admin picks a class while adding a teacher.

- [ ] **Step 1: Write the failing tests**

```ts
// test/unit/staff/staff.spec.ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateTeacherHandler } from '../../../src/staff/application/commands/create-teacher.handler';
import { CreateTeacherCommand } from '../../../src/staff/application/commands/create-teacher.command';
import { DeleteTeacherHandler } from '../../../src/staff/application/commands/delete-teacher.handler';
import { DeleteTeacherCommand } from '../../../src/staff/application/commands/delete-teacher.command';
import { GetTeachersHandler } from '../../../src/staff/application/queries/get-teachers.handler';
import { GetTeachersQuery } from '../../../src/staff/application/queries/get-teachers.query';
import { UserEntity, UserRole } from '../../../src/shared/entities/user.entity';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

describe('Staff command handlers', () => {
  let createHandler: CreateTeacherHandler;
  let deleteHandler: DeleteTeacherHandler;
  let repo: { create: jest.Mock; save: jest.Mock; findOneBy: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v: Partial<UserEntity>) => v as UserEntity),
      save: jest.fn((v: UserEntity) => Promise.resolve(v)),
      findOneBy: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreateTeacherHandler,
        DeleteTeacherHandler,
        { provide: getRepositoryToken(UserEntity), useValue: repo },
      ],
    }).compile();

    createHandler = module.get(CreateTeacherHandler);
    deleteHandler = module.get(DeleteTeacherHandler);
  });

  it('creates a teacher with a temporary password', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await createHandler.execute(
      new CreateTeacherCommand('Chenda Ly', 'chenda@school.edu'),
    );
    expect(result.email).toBe('chenda@school.edu');
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.TEACHER }));
  });

  it('rejects a duplicate email', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'existing' });
    await expect(
      createHandler.execute(new CreateTeacherCommand('Dup', 'taken@school.edu')),
    ).rejects.toThrow(ConflictException);
  });

  it('deletes a teacher', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(deleteHandler.execute(new DeleteTeacherCommand('1'))).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith({ id: '1', role: UserRole.TEACHER });
  });

  it('throws NotFoundException deleting a missing teacher', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(deleteHandler.execute(new DeleteTeacherCommand('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('GetTeachersHandler', () => {
  let handler: GetTeachersHandler;
  let userRepo: { find: jest.Mock };
  let classroomRepo: { find: jest.Mock };

  beforeEach(async () => {
    userRepo = { find: jest.fn() };
    classroomRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetTeachersHandler,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(ClassroomEntity), useValue: classroomRepo },
      ],
    }).compile();

    handler = module.get(GetTeachersHandler);
  });

  it("attaches each teacher's assigned classroom names", async () => {
    userRepo.find.mockResolvedValue([
      { id: 't1', name: 'Chenda', email: 'chenda@x.com', role: UserRole.TEACHER },
    ]);
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', teacherId: 't1' },
      { id: 'c2', name: 'Grade 5B', teacherId: 'other' },
    ]);

    const result = await handler.execute(new GetTeachersQuery());
    expect(result).toEqual([
      { id: 't1', name: 'Chenda', email: 'chenda@x.com', classroomNames: ['Grade 3A'] },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/staff/staff.spec.ts`
Expected: FAIL (modules don't exist yet)

- [ ] **Step 3: Implement the commands and query**

```ts
// src/staff/application/commands/create-teacher.command.ts
export class CreateTeacherCommand {
  constructor(
    public readonly name: string,
    public readonly email: string,
  ) {}
}
```

```ts
// src/staff/application/commands/create-teacher.handler.ts
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { ConflictException, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { CreateTeacherCommand } from './create-teacher.command';

export interface CreatedTeacher {
  id: string;
  name: string;
  email: string;
  temporaryPassword: string;
}

function generateTempPassword(): string {
  return randomBytes(9).toString('base64url'); // 12-char url-safe random password
}

@Injectable()
@CommandHandler(CreateTeacherCommand)
export class CreateTeacherHandler implements ICommandHandler<CreateTeacherCommand, CreatedTeacher> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async execute(command: CreateTeacherCommand): Promise<CreatedTeacher> {
    const existing = await this.userRepository.findOneBy({ email: command.email });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const user = this.userRepository.create({
      id: crypto.randomUUID(),
      name: command.name,
      email: command.email,
      passwordHash,
      role: UserRole.TEACHER,
    });
    await this.userRepository.save(user);

    return { id: user.id, name: user.name, email: user.email, temporaryPassword };
  }
}
```

```ts
// src/staff/application/commands/delete-teacher.command.ts
export class DeleteTeacherCommand {
  constructor(public readonly id: string) {}
}
```

```ts
// src/staff/application/commands/delete-teacher.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { DeleteTeacherCommand } from './delete-teacher.command';

@Injectable()
@CommandHandler(DeleteTeacherCommand)
export class DeleteTeacherHandler implements ICommandHandler<DeleteTeacherCommand, void> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async execute(command: DeleteTeacherCommand): Promise<void> {
    // Scoped to role: TEACHER so this endpoint can never be used to delete an
    // admin account even if an admin's id is passed in.
    const result = await this.userRepository.delete({ id: command.id, role: UserRole.TEACHER });
    if (!result.affected) {
      throw new NotFoundException('Teacher not found');
    }
  }
}
```

```ts
// src/staff/application/queries/get-teachers.query.ts
export class GetTeachersQuery {}
```

```ts
// src/staff/application/queries/get-teachers.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import { GetTeachersQuery } from './get-teachers.query';

export interface TeacherWithClassrooms {
  id: string;
  name: string;
  email: string;
  classroomNames: string[];
}

@Injectable()
@QueryHandler(GetTeachersQuery)
export class GetTeachersHandler implements IQueryHandler<GetTeachersQuery, TeacherWithClassrooms[]> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(): Promise<TeacherWithClassrooms[]> {
    const [teachers, classrooms] = await Promise.all([
      this.userRepository.find({ where: { role: UserRole.TEACHER }, order: { name: 'ASC' } }),
      this.classroomRepository.find(),
    ]);

    return teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      classroomNames: classrooms.filter((c) => c.teacherId === t.id).map((c) => c.name),
    }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/unit/staff/staff.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire up the DTO, controller, and module**

```ts
// src/staff/api/dto/create-teacher.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateTeacherDto {
  @ApiProperty({ example: 'Chenda Ly' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'chenda@school.edu' })
  @IsEmail()
  email: string;
}
```

```ts
// src/staff/api/controllers/staff.controller.ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { CreateTeacherDto } from '../dto/create-teacher.dto';
import { CreateTeacherCommand } from '../../application/commands/create-teacher.command';
import { DeleteTeacherCommand } from '../../application/commands/delete-teacher.command';
import { GetTeachersQuery } from '../../application/queries/get-teachers.query';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('staff')
export class StaffController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List teacher accounts with their assigned classrooms' })
  @Get()
  list() {
    return this.queryBus.execute(new GetTeachersQuery());
  }

  @ApiOperation({ summary: 'Create a teacher account, returns a one-time temporary password' })
  @Post()
  create(@Body() dto: CreateTeacherDto) {
    return this.commandBus.execute(new CreateTeacherCommand(dto.name, dto.email));
  }

  @ApiOperation({ summary: 'Remove a teacher account' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteTeacherCommand(id));
  }
}
```

```ts
// src/staff/staff.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../shared/entities/user.entity';
import { ClassroomEntity } from '../classroom/infrastructure/entities/classroom.entity';
import { StaffController } from './api/controllers/staff.controller';
import { CreateTeacherHandler } from './application/commands/create-teacher.handler';
import { DeleteTeacherHandler } from './application/commands/delete-teacher.handler';
import { GetTeachersHandler } from './application/queries/get-teachers.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([UserEntity, ClassroomEntity]),
    JwtModule.register({}),
  ],
  controllers: [StaffController],
  providers: [CreateTeacherHandler, DeleteTeacherHandler, GetTeachersHandler],
})
export class StaffModule {}
```

Modify `src/app.module.ts`: add `import { StaffModule } from './staff/staff.module';` and add `StaffModule` to `imports`.

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: lint clean; all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/staff src/app.module.ts test/unit/staff
git commit -m "feat(staff): add teacher-account admin CRUD"
```

---

## Task 3: Attendance extensions — "my classes today" + audit log (backend)

**Files:**
- Create: `src/attendance/api/dto/get-my-classes.dto.ts`
- Create: `src/attendance/application/queries/get-my-classes-today.query.ts`
- Create: `src/attendance/application/queries/get-my-classes-today.handler.ts`
- Create: `src/attendance/application/queries/get-audit-log.query.ts`
- Create: `src/attendance/application/queries/get-audit-log.handler.ts`
- Modify: `src/attendance/api/controllers/attendance.controller.ts` (add `GET /attendance/my-classes`, `GET /attendance/audit-log`)
- Modify: `src/attendance/attendance.module.ts` (add `ClassroomEntity`, `UserEntity` to `forFeature`; register the two new handlers)
- Test: `test/unit/attendance/get-my-classes-today.handler.spec.ts`
- Test: `test/unit/attendance/get-audit-log.handler.spec.ts`

**Interfaces:**
- Consumes: `ClassroomEntity.teacherId: string | null` (confirmed exact field name), `AttendanceRecordEntity` / `AttendanceAuditLogEntity` (both already exist, unchanged), `@CurrentUser()` decorator (returns the user id string directly), `GetRosterDto` (reused as-is for the audit-log endpoint — same `classroom_id`+`date` shape).
- Produces: `GET /attendance/my-classes?date=YYYY-MM-DD` (teacher only) → `MyClassSummary[]` (`{classroomId, name, gradeLabel, studentCount, unmarkedCount}`). `GET /attendance/audit-log?classroom_id=&date=` (admin+teacher) → `AuditLogEntry[]` (`{changedAt, studentName, changedByName, previousStatus, newStatus}`).

- [ ] **Step 1: Write the failing tests**

```ts
// test/unit/attendance/get-my-classes-today.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetMyClassesTodayHandler } from '../../../src/attendance/application/queries/get-my-classes-today.handler';
import { GetMyClassesTodayQuery } from '../../../src/attendance/application/queries/get-my-classes-today.query';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('GetMyClassesTodayHandler', () => {
  let handler: GetMyClassesTodayHandler;
  let classroomRepo: { find: jest.Mock };
  let studentRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };

  beforeEach(async () => {
    classroomRepo = { find: jest.fn() };
    studentRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetMyClassesTodayHandler,
        { provide: getRepositoryToken(ClassroomEntity), useValue: classroomRepo },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: getRepositoryToken(AttendanceRecordEntity), useValue: recordRepo },
      ],
    }).compile();

    handler = module.get(GetMyClassesTodayHandler);
  });

  it("returns unmarked counts for the teacher's own classrooms only", async () => {
    classroomRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Grade 3A', gradeLabel: 'Grade 3', teacherId: 't1' },
    ]);
    studentRepo.find.mockResolvedValue([
      { id: 's1', classroomId: 'c1' },
      { id: 's2', classroomId: 'c1' },
    ]);
    recordRepo.find.mockResolvedValue([{ studentId: 's1', date: '2026-08-28' }]);

    const result = await handler.execute(new GetMyClassesTodayQuery('t1', '2026-08-28'));
    expect(result).toEqual([
      { classroomId: 'c1', name: 'Grade 3A', gradeLabel: 'Grade 3', studentCount: 2, unmarkedCount: 1 },
    ]);
  });

  it('returns an empty array when the teacher has no classrooms', async () => {
    classroomRepo.find.mockResolvedValue([]);
    const result = await handler.execute(new GetMyClassesTodayQuery('t1', '2026-08-28'));
    expect(result).toEqual([]);
    expect(studentRepo.find).not.toHaveBeenCalled();
  });
});
```

```ts
// test/unit/attendance/get-audit-log.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetAuditLogHandler } from '../../../src/attendance/application/queries/get-audit-log.handler';
import { GetAuditLogQuery } from '../../../src/attendance/application/queries/get-audit-log.query';
import { AttendanceAuditLogEntity } from '../../../src/attendance/infrastructure/entities/attendance-audit-log.entity';
import { AttendanceRecordEntity } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { UserEntity } from '../../../src/shared/entities/user.entity';

describe('GetAuditLogHandler', () => {
  let handler: GetAuditLogHandler;
  let auditRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };
  let studentRepo: { find: jest.Mock };
  let userRepo: { find: jest.Mock };

  beforeEach(async () => {
    auditRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };
    studentRepo = { find: jest.fn() };
    userRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetAuditLogHandler,
        { provide: getRepositoryToken(AttendanceAuditLogEntity), useValue: auditRepo },
        { provide: getRepositoryToken(AttendanceRecordEntity), useValue: recordRepo },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();

    handler = module.get(GetAuditLogHandler);
  });

  it('joins audit entries to student and user names', async () => {
    recordRepo.find.mockResolvedValue([
      { id: 'r1', studentId: 's1', classroomId: 'c1', date: '2026-08-28' },
    ]);
    auditRepo.find.mockResolvedValue([
      {
        attendanceRecordId: 'r1',
        changedByUserId: 'u1',
        previousStatus: 'present',
        newStatus: 'late',
        changedAt: new Date('2026-08-28T08:10:00Z'),
      },
    ]);
    studentRepo.find.mockResolvedValue([{ id: 's1', name: 'Sokha' }]);
    userRepo.find.mockResolvedValue([{ id: 'u1', name: 'Chenda' }]);

    const result = await handler.execute(new GetAuditLogQuery('c1', '2026-08-28'));
    expect(result).toEqual([
      {
        changedAt: new Date('2026-08-28T08:10:00Z'),
        studentName: 'Sokha',
        changedByName: 'Chenda',
        previousStatus: 'present',
        newStatus: 'late',
      },
    ]);
  });

  it('returns an empty array when there are no attendance records for the day', async () => {
    recordRepo.find.mockResolvedValue([]);
    const result = await handler.execute(new GetAuditLogQuery('c1', '2026-08-28'));
    expect(result).toEqual([]);
    expect(auditRepo.find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/attendance/get-my-classes-today.handler.spec.ts test/unit/attendance/get-audit-log.handler.spec.ts`
Expected: FAIL (modules don't exist yet)

- [ ] **Step 3: Implement the queries**

```ts
// src/attendance/application/queries/get-my-classes-today.query.ts
export class GetMyClassesTodayQuery {
  constructor(
    public readonly teacherId: string,
    public readonly date: string,
  ) {}
}
```

```ts
// src/attendance/application/queries/get-my-classes-today.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { GetMyClassesTodayQuery } from './get-my-classes-today.query';

export interface MyClassSummary {
  classroomId: string;
  name: string;
  gradeLabel: string | null;
  studentCount: number;
  unmarkedCount: number;
}

@Injectable()
@QueryHandler(GetMyClassesTodayQuery)
export class GetMyClassesTodayHandler
  implements IQueryHandler<GetMyClassesTodayQuery, MyClassSummary[]>
{
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetMyClassesTodayQuery): Promise<MyClassSummary[]> {
    const classrooms = await this.classroomRepository.find({
      where: { teacherId: query.teacherId },
      order: { name: 'ASC' },
    });
    if (classrooms.length === 0) return [];

    const [students, records] = await Promise.all([
      this.studentRepository.find(),
      this.recordRepository.find({ where: { date: query.date } }),
    ]);
    const markedStudentIds = new Set(records.map((r) => r.studentId));

    return classrooms.map((c) => {
      const roster = students.filter((s) => s.classroomId === c.id);
      const unmarkedCount = roster.filter((s) => !markedStudentIds.has(s.id)).length;
      return {
        classroomId: c.id,
        name: c.name,
        gradeLabel: c.gradeLabel,
        studentCount: roster.length,
        unmarkedCount,
      };
    });
  }
}
```

```ts
// src/attendance/application/queries/get-audit-log.query.ts
export class GetAuditLogQuery {
  constructor(
    public readonly classroomId: string,
    public readonly date: string,
  ) {}
}
```

```ts
// src/attendance/application/queries/get-audit-log.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceAuditLogEntity } from '../../infrastructure/entities/attendance-audit-log.entity';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { UserEntity } from '../../../shared/entities/user.entity';
import { GetAuditLogQuery } from './get-audit-log.query';

export interface AuditLogEntry {
  changedAt: Date;
  studentName: string;
  changedByName: string;
  previousStatus: string;
  newStatus: string;
}

@Injectable()
@QueryHandler(GetAuditLogQuery)
export class GetAuditLogHandler implements IQueryHandler<GetAuditLogQuery, AuditLogEntry[]> {
  constructor(
    @InjectRepository(AttendanceAuditLogEntity)
    private readonly auditRepository: Repository<AttendanceAuditLogEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async execute(query: GetAuditLogQuery): Promise<AuditLogEntry[]> {
    const records = await this.recordRepository.find({
      where: { classroomId: query.classroomId, date: query.date },
    });
    if (records.length === 0) return [];

    const recordById = new Map(records.map((r) => [r.id, r]));
    const entries = await this.auditRepository.find({
      where: { attendanceRecordId: In(records.map((r) => r.id)) },
      order: { changedAt: 'DESC' },
    });
    if (entries.length === 0) return [];

    const studentIds = [
      ...new Set(
        entries
          .map((e) => recordById.get(e.attendanceRecordId)?.studentId)
          .filter((id): id is string => !!id),
      ),
    ];
    const userIds = [...new Set(entries.map((e) => e.changedByUserId))];
    const [students, users] = await Promise.all([
      this.studentRepository.find({ where: { id: In(studentIds) } }),
      this.userRepository.find({ where: { id: In(userIds) } }),
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return entries.map((e) => {
      const record = recordById.get(e.attendanceRecordId);
      const student = record ? studentById.get(record.studentId) : undefined;
      const user = userById.get(e.changedByUserId);
      return {
        changedAt: e.changedAt,
        studentName: student?.name ?? 'Unknown student',
        changedByName: user?.name ?? 'Unknown',
        previousStatus: e.previousStatus,
        newStatus: e.newStatus,
      };
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/unit/attendance/get-my-classes-today.handler.spec.ts test/unit/attendance/get-audit-log.handler.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire up the DTO, controller, and module**

```ts
// src/attendance/api/dto/get-my-classes.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class GetMyClassesDto {
  @ApiProperty({ example: '2026-08-28' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;
}
```

In `src/attendance/api/controllers/attendance.controller.ts`, add imports:

```ts
import { GetMyClassesDto } from '../dto/get-my-classes.dto';
import { GetMyClassesTodayQuery } from '../../application/queries/get-my-classes-today.query';
import { GetAuditLogQuery } from '../../application/queries/get-audit-log.query';
```

And add two new routes inside `AttendanceController` (after `roster()`):

```ts
  @ApiOperation({ summary: "Get the current teacher's classrooms with today's unmarked count" })
  @Roles(UserRole.TEACHER)
  @Get('my-classes')
  myClasses(@CurrentUser() userId: string, @Query() query: GetMyClassesDto) {
    return this.queryBus.execute(new GetMyClassesTodayQuery(userId, query.date));
  }

  @ApiOperation({ summary: "Get today's attendance edit history for a classroom" })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get('audit-log')
  auditLog(@Query() query: GetRosterDto) {
    return this.queryBus.execute(new GetAuditLogQuery(query.classroom_id, query.date));
  }
```

In `src/attendance/attendance.module.ts`, add `ClassroomEntity` and `UserEntity` imports and to the `TypeOrmModule.forFeature([...])` array (alongside the existing `StudentEntity, AttendanceRecordEntity, AttendanceAuditLogEntity`), and add `GetMyClassesTodayHandler, GetAuditLogHandler` to `providers`.

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: lint clean; all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/attendance test/unit/attendance/get-my-classes-today.handler.spec.ts test/unit/attendance/get-audit-log.handler.spec.ts
git commit -m "feat(attendance): add my-classes and audit-log queries"
```

---

## Task 4: Reports module (backend)

**Files:**
- Create: `src/reports/application/queries/get-reports-summary.query.ts`
- Create: `src/reports/application/queries/get-reports-summary.handler.ts`
- Create: `src/reports/api/controllers/reports.controller.ts`
- Create: `src/reports/reports.module.ts`
- Modify: `src/app.module.ts` (register `ReportsModule`)
- Test: `test/unit/reports/get-reports-summary.handler.spec.ts`

**Interfaces:**
- Consumes: `AttendanceRecordEntity` (`studentId, classroomId, date: string 'YYYY-MM-DD', status`), `StudentEntity` (`classroomId`), `ClassroomEntity` (`name`), `getSchoolToday()` from `src/shared/utils/school-date.util.ts` (existing util, used by the controller to supply "today").
- Produces: `GET /reports/summary` (admin only) → `ReportsSummary` (`{overallRatePct, chronicCount, dailySummary: ClassDailySummary[], studentRows: StudentReportRow[]}`).
- **Deviation from established codebase convention:** this is the first use of TypeORM's `In(...)` repository operator for a multi-id filter (also used in Task 3) — still `Repository.find()`-based, not `createQueryBuilder`, consistent with "aggregate in-memory" being the established pattern; flagged since it's new, not because it's risky.
- Window: last 20 calendar days ending "today" (inclusive), matching the spec's `historyFor()` `totalDays = 20`. Chronic threshold: `absentCount >= 3` in that window (spec's `absentCount >= 3`). A student with zero records in the window gets `ratePct: 100` (not `0`) and `chronic: false` — absence of data isn't evidence of absence.

- [ ] **Step 1: Write the failing tests**

```ts
// test/unit/reports/get-reports-summary.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetReportsSummaryHandler } from '../../../src/reports/application/queries/get-reports-summary.handler';
import { GetReportsSummaryQuery } from '../../../src/reports/application/queries/get-reports-summary.query';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';
import { AttendanceRecordEntity } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('GetReportsSummaryHandler', () => {
  let handler: GetReportsSummaryHandler;
  let studentRepo: { find: jest.Mock };
  let classroomRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };

  beforeEach(async () => {
    studentRepo = { find: jest.fn() };
    classroomRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetReportsSummaryHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: getRepositoryToken(ClassroomEntity), useValue: classroomRepo },
        { provide: getRepositoryToken(AttendanceRecordEntity), useValue: recordRepo },
      ],
    }).compile();

    handler = module.get(GetReportsSummaryHandler);
  });

  it('flags a student as chronic at 3 or more absences in the window', async () => {
    studentRepo.find.mockResolvedValue([{ id: 's1', name: 'Sokha', classroomId: 'c1' }]);
    classroomRepo.find.mockResolvedValue([{ id: 'c1', name: 'Grade 3A', teacherId: null }]);
    recordRepo.find.mockResolvedValue([
      { studentId: 's1', classroomId: 'c1', date: '2026-08-26', status: 'absent' },
      { studentId: 's1', classroomId: 'c1', date: '2026-08-27', status: 'absent' },
      { studentId: 's1', classroomId: 'c1', date: '2026-08-28', status: 'absent' },
    ]);

    const result = await handler.execute(new GetReportsSummaryQuery('2026-08-28'));
    expect(result.studentRows[0]).toMatchObject({ absent: 3, chronic: true });
    expect(result.chronicCount).toBe(1);
  });

  it('gives a student with no records yet a 100% rate and non-chronic status', async () => {
    studentRepo.find.mockResolvedValue([{ id: 's1', name: 'Sokha', classroomId: 'c1' }]);
    classroomRepo.find.mockResolvedValue([{ id: 'c1', name: 'Grade 3A', teacherId: null }]);
    recordRepo.find.mockResolvedValue([]);

    const result = await handler.execute(new GetReportsSummaryQuery('2026-08-28'));
    expect(result.studentRows[0]).toMatchObject({ ratePct: 100, chronic: false });
    expect(result.overallRatePct).toBe(100);
  });

  it("excludes records outside the 20-day window from a student's counts", async () => {
    studentRepo.find.mockResolvedValue([{ id: 's1', name: 'Sokha', classroomId: 'c1' }]);
    classroomRepo.find.mockResolvedValue([{ id: 'c1', name: 'Grade 3A', teacherId: null }]);
    recordRepo.find.mockResolvedValue([
      { studentId: 's1', classroomId: 'c1', date: '2026-07-01', status: 'absent' },
    ]);

    const result = await handler.execute(new GetReportsSummaryQuery('2026-08-28'));
    expect(result.studentRows[0]).toMatchObject({ absent: 0, chronic: false });
  });

  it("summarizes today's marks per class including unmarked count", async () => {
    studentRepo.find.mockResolvedValue([
      { id: 's1', name: 'Sokha', classroomId: 'c1' },
      { id: 's2', name: 'Dara', classroomId: 'c1' },
    ]);
    classroomRepo.find.mockResolvedValue([{ id: 'c1', name: 'Grade 3A', teacherId: null }]);
    recordRepo.find.mockResolvedValue([
      { studentId: 's1', classroomId: 'c1', date: '2026-08-28', status: 'present' },
    ]);

    const result = await handler.execute(new GetReportsSummaryQuery('2026-08-28'));
    expect(result.dailySummary[0]).toEqual({
      classroomId: 'c1',
      classroomName: 'Grade 3A',
      present: 1,
      late: 0,
      absent: 0,
      unmarked: 1,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/reports/get-reports-summary.handler.spec.ts`
Expected: FAIL (module doesn't exist yet)

- [ ] **Step 3: Implement the query**

```ts
// src/reports/application/queries/get-reports-summary.query.ts
export class GetReportsSummaryQuery {
  constructor(public readonly today: string) {}
}
```

```ts
// src/reports/application/queries/get-reports-summary.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import { AttendanceRecordEntity } from '../../../attendance/infrastructure/entities/attendance-record.entity';
import { GetReportsSummaryQuery } from './get-reports-summary.query';

const WINDOW_DAYS = 20;
const CHRONIC_ABSENCE_THRESHOLD = 3;

export interface StudentReportRow {
  studentId: string;
  studentName: string;
  classroomName: string;
  present: number;
  late: number;
  absent: number;
  ratePct: number;
  chronic: boolean;
}

export interface ClassDailySummary {
  classroomId: string;
  classroomName: string;
  present: number;
  late: number;
  absent: number;
  unmarked: number;
}

export interface ReportsSummary {
  overallRatePct: number;
  chronicCount: number;
  dailySummary: ClassDailySummary[];
  studentRows: StudentReportRow[];
}

function windowStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (WINDOW_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

@Injectable()
@QueryHandler(GetReportsSummaryQuery)
export class GetReportsSummaryHandler implements IQueryHandler<GetReportsSummaryQuery, ReportsSummary> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetReportsSummaryQuery): Promise<ReportsSummary> {
    const { today } = query;
    const start = windowStart(today);

    const [students, classrooms, allRecords] = await Promise.all([
      this.studentRepository.find(),
      this.classroomRepository.find(),
      this.recordRepository.find(),
    ]);

    const classroomById = new Map(classrooms.map((c) => [c.id, c]));
    const windowRecords = allRecords.filter((r) => r.date >= start && r.date <= today);

    const studentRows: StudentReportRow[] = students.map((s) => {
      const records = windowRecords.filter((r) => r.studentId === s.id);
      const present = records.filter((r) => r.status === 'present').length;
      const late = records.filter((r) => r.status === 'late').length;
      const absent = records.filter((r) => r.status === 'absent').length;
      const totalMarked = present + late + absent;
      const ratePct = totalMarked === 0 ? 100 : Math.round(((present + late) / totalMarked) * 100);
      return {
        studentId: s.id,
        studentName: s.name,
        classroomName: classroomById.get(s.classroomId)?.name ?? 'Unassigned',
        present,
        late,
        absent,
        ratePct,
        chronic: absent >= CHRONIC_ABSENCE_THRESHOLD,
      };
    });

    const overallRatePct =
      studentRows.length === 0
        ? 100
        : Math.round(studentRows.reduce((sum, r) => sum + r.ratePct, 0) / studentRows.length);
    const chronicCount = studentRows.filter((r) => r.chronic).length;

    const todayRecords = allRecords.filter((r) => r.date === today);
    const dailySummary: ClassDailySummary[] = classrooms.map((c) => {
      const roster = students.filter((s) => s.classroomId === c.id);
      const records = todayRecords.filter((r) => r.classroomId === c.id);
      const present = records.filter((r) => r.status === 'present').length;
      const late = records.filter((r) => r.status === 'late').length;
      const absent = records.filter((r) => r.status === 'absent').length;
      return {
        classroomId: c.id,
        classroomName: c.name,
        present,
        late,
        absent,
        unmarked: roster.length - present - late - absent,
      };
    });

    return { overallRatePct, chronicCount, dailySummary, studentRows };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/unit/reports/get-reports-summary.handler.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire up the controller and module**

```ts
// src/reports/api/controllers/reports.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { getSchoolToday } from '../../../shared/utils/school-date.util';
import { GetReportsSummaryQuery } from '../../application/queries/get-reports-summary.query';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @ApiOperation({ summary: 'Attendance report summary for the last 20 days (admin only)' })
  @Get('summary')
  summary() {
    return this.queryBus.execute(new GetReportsSummaryQuery(getSchoolToday()));
  }
}
```

```ts
// src/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../classroom/infrastructure/entities/classroom.entity';
import { AttendanceRecordEntity } from '../attendance/infrastructure/entities/attendance-record.entity';
import { ReportsController } from './api/controllers/reports.controller';
import { GetReportsSummaryHandler } from './application/queries/get-reports-summary.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([StudentEntity, ClassroomEntity, AttendanceRecordEntity]),
    JwtModule.register({}),
  ],
  controllers: [ReportsController],
  providers: [GetReportsSummaryHandler],
})
export class ReportsModule {}
```

Modify `src/app.module.ts`: add `import { ReportsModule } from './reports/reports.module';` and add `ReportsModule` to `imports`.

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: lint clean; all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/reports src/app.module.ts test/unit/reports
git commit -m "feat(reports): add attendance-rate and chronic-absentee summary query"
```

- [ ] **Step 8: Verify the full backend end-to-end and push**

Run: `npm run seed` against a running Postgres (`docker compose up -d`), then `npm run start:dev` and confirm via Swagger (`http://localhost:8091/api`, `ENABLE_SWAGGER=true`) that all four new route groups (`/school-settings`, `/staff`, `/attendance/my-classes`, `/attendance/audit-log`, `/reports/summary`) appear and respond (401 without a token, real data with an admin/teacher token from `npm run seed`'s accounts).

```bash
git push -u origin worktree-rollcall
```

---

## Task 5: Design tokens, fonts, and app shell/nav (frontend, foundational)

> **Repo for all remaining tasks:** `attendance-admin`, worktree `.claude/worktrees/rollcall`, branch `worktree-rollcall`. **No test runner is configured in this repo** (confirmed: `npm test` → "Missing script"); the quality gate is `npm run lint && npx tsc --noEmit`, per this repo's own `CLAUDE.md`. Every frontend task's steps are: implement → lint/typecheck → manual verification → commit (no red/green TDD cycle).

**Files:**
- Modify: `src/app/globals.css` (full token rewrite: blue palette, IBM Plex Mono, renamed/pruned semantic tokens)
- Modify: `src/lib/fonts.ts` (add `ibmPlexMono` export)
- Modify: `src/app/layout.tsx` (apply `ibmPlexMono.variable`)
- Modify: `src/components/shared/status-chip.tsx` (rewrite for attendance-domain statuses, renamed tokens)
- Modify: `src/components/shared/form-controls.tsx` (rename `var(--hn-wish)` → `var(--hn-danger)`, the only other consumer of the renamed token)
- Create: `src/lib/avatar.ts` (shared `avatarColor(id)` / `initials(name)` helpers — spec's exact 4-color rotation, used by every screen with a person row from Task 6 onward)
- Create: `src/components/shared/dashboard-nav.tsx` (client nav pill with active-route highlighting)
- Modify: `src/app/(dashboard)/layout.tsx` (full redesign: logo, nav pill with new admin tabs, user avatar+initials)

**Interfaces:**
- Produces: `avatarColor(id: string): string`, `initials(name: string): string` from `@/lib/avatar` — consumed by Tasks 6, 7, 9.
- Produces: `--hn-danger` and `--hn-neutral` CSS custom properties, replacing `--hn-wish` and `--hn-cart` (renamed, not aliased — every consumer is updated in this task, verified below). `--hn-pass` and `--hn-detail` are dropped entirely (confirmed unused anywhere in `src/` beyond their own declaration).
- Produces: `--font-mono` Tailwind utility (`font-mono` class) resolving to IBM Plex Mono, for Task 6/9/10's stat numbers, codes, and timestamps.

**Note on dark mode:** the spec is light-mode only. The dark values below are this plan's own extrapolation (brightened blue `#3B8FE0` for contrast on a dark ground, softened greys) — not a spec requirement, but necessary since the app already supports a dark theme (`next-themes`) and every screen must render correctly in both.

- [ ] **Step 1: Confirm every current consumer of the tokens being renamed/dropped**

Run: `grep -rn "hn-wish\|hn-cart\|hn-pass\|hn-detail" src` — expected hits: `globals.css` (its own declarations), `status-chip.tsx` (rewritten in this task), `form-controls.tsx` (one line, fixed in this task). If this grep finds any OTHER file, add it to this task's file list before proceeding — do not rename/drop a token with a live consumer outside this task's plan.

- [ ] **Step 2: Rewrite `globals.css`**

Replace the full content of `src/app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:where(.dark, .dark *));

@layer base {
  :root {
    /* Rollcall palette — warm-neutral paper, near-black ink, blue accent */
    --background: 60 11.1% 96.5%;
    --foreground: 0 0% 6.3%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 6.3%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 6.3%;
    --primary: 210 100% 40%;
    --primary-foreground: 0 0% 100%;
    --secondary: 60 9.5% 91.8%;
    --secondary-foreground: 0 0% 6.3%;
    --muted: 60 9.5% 91.8%;
    --muted-foreground: 60 0.8% 47.5%;
    --accent: 60 9.5% 91.8%;
    --accent-foreground: 0 0% 6.3%;
    --destructive: 2 45.5% 45.3%;
    --destructive-foreground: 0 0% 100%;
    --border: 60 7.4% 89.4%;
    --input: 60 7.4% 89.4%;
    --ring: 210 100% 40%;
    --radius: 0.6875rem;
  }

  .dark {
    --background: 0 0% 7.1%;
    --foreground: 60 7.1% 94.5%;
    --card: 0 0% 10.2%;
    --card-foreground: 60 7.1% 94.5%;
    --popover: 0 0% 10.2%;
    --popover-foreground: 60 7.1% 94.5%;
    --primary: 209 72.7% 55.5%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 14.1%;
    --secondary-foreground: 60 7.1% 94.5%;
    --muted: 0 0% 14.1%;
    --muted-foreground: 60 1.5% 59.8%;
    --accent: 0 0% 14.1%;
    --accent-foreground: 60 7.1% 94.5%;
    --destructive: 3 54.5% 62.9%;
    --destructive-foreground: 0 0% 100%;
    --border: 60 2.2% 17.6%;
    --input: 60 2.2% 17.6%;
    --ring: 209 72.7% 55.5%;
  }

  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-plus-jakarta-sans), system-ui, sans-serif;
  }
  html {
    @apply font-sans;
    font-family: var(--font-plus-jakarta-sans), system-ui, sans-serif;
    font-size: 16px;
  }
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --color-hn-paper: var(--hn-paper);
  --color-hn-surface: var(--hn-surface);
  --color-hn-surface-2: var(--hn-surface-2);
  --color-hn-ink: var(--hn-ink);
  --color-hn-ink-soft: var(--hn-ink-soft);
  --color-hn-sub: var(--hn-sub);
  --color-hn-line: var(--hn-line);
  --color-hn-line-2: var(--hn-line-2);
  --color-hn-hair: var(--hn-hair);
  --color-hn-clay: var(--hn-clay);
  --color-hn-success: var(--hn-success);
  --color-hn-danger: var(--hn-danger);
  --color-hn-neutral: var(--hn-neutral);
  --font-sans: var(--font-plus-jakarta-sans), system-ui, sans-serif;
  --font-mono: var(--font-ibm-plex-mono), ui-monospace, monospace;
}

/* Rollcall tokens — outside @layer so unlayered rules apply correctly */
:root {
  --hn-paper: #F7F7F5;
  --hn-surface: #FFFFFF;
  --hn-surface-2: #F7F7F5;
  --hn-ink: #101010;
  --hn-ink-soft: #404040;
  --hn-sub: #7A7A78;
  --hn-line: #E6E6E2;
  --hn-line-2: #ECECE8;
  --hn-hair: #ECECE8;
  --hn-clay: #0066CC;
  --hn-success: #2E7D4F;
  --hn-danger: #A8433F;
  --hn-neutral: #5B5955;
  --hn-elev: 0 1px 2px rgba(16,16,16,.03), 0 10px 24px rgba(16,16,16,.05);
  --hn-elev-sm: 0 1px 2px rgba(16,16,16,.03), 0 6px 16px rgba(16,16,16,.04);
  --hn-clay-shadow: 0 4px 12px rgba(0,102,204,.26);
  --hn-drawer-shadow: 0 -12px 40px -8px rgba(16,16,16,.14);
  --hn-nav-clearance: 6rem;
}

.dark {
  --hn-paper: #121212;
  --hn-surface: #1A1A1A;
  --hn-surface-2: #1F1F1F;
  --hn-ink: #F2F2F0;
  --hn-ink-soft: #C9C9C7;
  --hn-sub: #9A9A97;
  --hn-line: #2E2E2C;
  --hn-line-2: #242424;
  --hn-hair: #242424;
  --hn-clay: #3B8FE0;
  --hn-success: #4CAE7A;
  --hn-danger: #D4726D;
  --hn-neutral: #9C9994;
  --hn-elev: 0 1px 2px rgba(0,0,0,.3), 0 12px 28px rgba(0,0,0,.5);
  --hn-elev-sm: 0 1px 2px rgba(0,0,0,.3), 0 6px 14px rgba(0,0,0,.4);
  --hn-clay-shadow: 0 4px 14px rgba(59,143,224,.32);
  --hn-drawer-shadow: 0 -12px 40px -8px rgba(0,0,0,.4);
}

/* NProgress bar — themed to match app design */
#nprogress .bar {
  background: var(--hn-clay) !important;
  height: 2px !important;
  z-index: 9999 !important;
}
#nprogress .peg {
  box-shadow: 0 0 8px var(--hn-clay), 0 0 4px var(--hn-clay) !important;
}
```

- [ ] **Step 3: Add the IBM Plex Mono font**

Replace the full content of `src/lib/fonts.ts`:

```ts
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google'

export const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta-sans',
  subsets: ['latin'],
  display: 'swap',
})

export const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
})
```

In `src/app/layout.tsx`: add `ibmPlexMono` to the import from `@/lib/fonts`, and change the `<html>` `className` from `` `${plusJakartaSans.variable} min-h-svh antialiased` `` to `` `${plusJakartaSans.variable} ${ibmPlexMono.variable} min-h-svh antialiased` ``.

- [ ] **Step 4: Add the shared avatar helpers**

```ts
// src/lib/avatar.ts
const AVATAR_PALETTE = ['#0066CC', '#4B6B8A', '#46935E', '#C2605F']

/** Deterministic color per entity id, matching the design's avatar rotation. */
export function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
```

- [ ] **Step 5: Rewrite the status chip for attendance-domain statuses**

Replace the full content of `src/components/shared/status-chip.tsx`:

```tsx
type AnyStatus = 'present' | 'absent' | 'late' | 'linked' | 'unlinked' | 'checking' | 'active' | 'inactive'

interface ChipStyle {
  label: string
  color: string
}

const STATUS_STYLES: Record<AnyStatus, ChipStyle> = {
  present: { label: 'Present', color: 'var(--hn-success)' },
  absent: { label: 'Absent', color: 'var(--hn-danger)' },
  late: { label: 'Late', color: 'var(--hn-neutral)' },
  linked: { label: 'Linked', color: 'var(--hn-success)' },
  unlinked: { label: 'Unlinked', color: 'var(--hn-sub)' },
  checking: { label: 'Checking…', color: 'var(--hn-sub)' },
  active: { label: 'Active', color: 'var(--hn-success)' },
  inactive: { label: 'Inactive', color: 'var(--hn-sub)' },
}

interface StatusChipProps {
  status: AnyStatus
  label?: string
  bare?: boolean
}

/** The display label for a status, without rendering a chip — for reuse
 *  anywhere a status needs a human-readable name (dropdown options, dialog
 *  copy, segment filters) without duplicating `STATUS_STYLES`' strings. */
export function statusLabel(status: AnyStatus): string {
  return STATUS_STYLES[status].label
}

export function StatusChip({ status, label, bare = false }: StatusChipProps) {
  const style = STATUS_STYLES[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap"
      style={{
        color: style.color,
        background: `color-mix(in srgb, ${style.color} 14%, transparent)`,
      }}
    >
      {!bare && <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.color }} />}
      {label ?? style.label}
    </span>
  )
}
```

In `src/components/shared/form-controls.tsx`, change the one occurrence of `color: 'var(--hn-wish)'` to `color: 'var(--hn-danger)'`.

- [ ] **Step 6: Build the client nav component**

```tsx
// src/components/shared/dashboard-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 p-[3px] rounded-full" style={{ background: 'var(--hn-line-2)' }}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className="text-[13px] font-bold px-4 py-1.5 rounded-full transition-colors"
            style={
              active
                ? { background: 'var(--hn-surface)', color: 'var(--hn-ink)' }
                : { color: 'var(--hn-sub)' }
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 7: Redesign the dashboard shell**

Replace the full content of `src/app/(dashboard)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser, logout } from '@/features/auth/actions'
import { DashboardNav } from '@/components/shared/dashboard-nav'
import { initials } from '@/lib/avatar'

const ADMIN_NAV = [
  { href: '/classrooms', label: 'Classrooms' },
  { href: '/students', label: 'Students' },
  { href: '/linking-codes', label: 'Linking codes' },
  { href: '/staff', label: 'Staff' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
]
const TEACHER_NAV = [{ href: '/attendance', label: 'Attendance' }]

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  const nav = user.role === 'admin' ? ADMIN_NAV : TEACHER_NAV

  return (
    <div className="min-h-svh flex flex-col" style={{ background: 'var(--hn-paper)' }}>
      <header
        className="flex items-center gap-6 px-7 py-3.5 sticky top-0 z-20"
        style={{
          background: 'var(--hn-surface)',
          borderBottom: '1px solid var(--hn-line)',
          boxShadow: '0 1px 2px rgba(16,16,16,0.03)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-[15px]"
            style={{ background: 'var(--hn-clay)' }}
            aria-hidden="true"
          >
            R
          </div>
          <span className="text-[16px] font-bold tracking-tight">Rollcall</span>
        </div>
        <DashboardNav items={nav} />
        <div className="flex-1" />
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--hn-clay)' }}
          >
            {initials(user.name)}
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold">{user.name}</div>
            <div className="text-xs capitalize" style={{ color: 'var(--hn-sub)' }}>
              {user.role}
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="text-sm ml-2" style={{ color: 'var(--hn-sub)' }}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
```

- [ ] **Step 8: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean. (Existing screens still reference the old `<ul>`/plain-Tailwind styling — they'll look inconsistent with the new header until Tasks 6–7 restyle them; that's expected at this checkpoint, not a bug.)

Run: `npm run dev`, log in as both the seeded admin and teacher accounts (`admin@attendance.dev` / `teacher@attendance.dev`, password `password123`, from the backend's `npm run seed`), and confirm: the header shows the blue "R" logo, "Rollcall", a working nav pill with the correct tabs per role and correct active-tab highlighting as you click between them, and the user's initials avatar. Toggle dark mode (if a theme toggle is reachable — otherwise force it via `document.documentElement.classList.add('dark')` in the browser console) and confirm the header still reads correctly (no invisible text, no clipped contrast).

- [ ] **Step 9: Commit**

```bash
git add src/app/globals.css src/lib/fonts.ts src/app/layout.tsx src/lib/avatar.ts src/components/shared/status-chip.tsx src/components/shared/form-controls.tsx src/components/shared/dashboard-nav.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat(design): adopt Rollcall blue palette, IBM Plex Mono, redesigned nav shell"
```

---

## Task 6: Teacher dashboard redesign (frontend)

Depends on: Task 3 (backend `my-classes`/`audit-log` endpoints), Task 5 (`avatarColor`/`initials`, tokens).

**Files:**
- Modify: `src/features/attendance/types.ts` (add `MyClassSummary`, `AuditLogEntry`)
- Modify: `src/features/attendance/actions/attendance.action.ts` (add `getMyClasses`, `getAuditLog`)
- Modify: `src/features/attendance/actions/index.ts` (export the two new actions)
- Modify: `src/features/attendance/hooks/use-attendance.ts` (add `useMyClasses`, `useAuditLog`)
- Create: `src/features/attendance/components/roster-row.tsx`
- Modify: `src/features/attendance/components/attendance-screen.tsx` (full rewrite)

**Interfaces:**
- Consumes: `avatarColor`, `initials` from `@/lib/avatar` (Task 5); `markAttendance(studentId, classroomId, date, status, note?)` — already supports `note` end to end on the backend (verified: `MarkAttendanceDto.note?` → command → `AttendanceRecordEntity.note`), no backend change needed here; `bulkMarkAttendance(studentIds, classroomId, date, status)` (existing, unchanged).
- Produces: `RosterRow` component (`{entry: RosterEntry, pending: boolean, onMark: (status, note?) => void}`), reused as-is (no changes needed) by no other task.

**Deviation (see Global Constraints):** no batch "Save & notify parents" step — every mark already persists and notifies immediately via the existing `MarkAttendanceCommand → AttendanceMarkedEvent` flow. "Mark all present" now **only fills currently-unmarked students** (matching the spec's actual `markAllPresent` logic — `if (!next[st.id]) next[st.id]='present'` — which never overwrites an existing mark), a behavior fix versus the current app's confirm-dialog copy which incorrectly claims it "will overwrite any existing marks."

- [ ] **Step 1: Extend types**

In `src/features/attendance/types.ts`, add below the existing `RosterEntry` interface:

```ts
export interface MyClassSummary {
  classroomId: string
  name: string
  gradeLabel: string | null
  studentCount: number
  unmarkedCount: number
}

export interface AuditLogEntry {
  changedAt: string
  studentName: string
  changedByName: string
  previousStatus: AttendanceStatus
  newStatus: AttendanceStatus
}
```

- [ ] **Step 2: Extend the actions**

In `src/features/attendance/actions/attendance.action.ts`, add the import `MyClassSummary, AuditLogEntry` to the existing `import type { AttendanceStatus, RosterEntry } from '../types'` line, and append:

```ts
interface MyClassSummaryApi {
  classroom_id: string
  name: string
  grade_label: string | null
  student_count: number
  unmarked_count: number
}

function toMyClassSummary(api: MyClassSummaryApi): MyClassSummary {
  return {
    classroomId: api.classroom_id,
    name: api.name,
    gradeLabel: api.grade_label,
    studentCount: api.student_count,
    unmarkedCount: api.unmarked_count,
  }
}

export async function getMyClasses(date: string): Promise<MyClassSummary[]> {
  const items = await apiFetch<MyClassSummaryApi[]>(`/attendance/my-classes?date=${date}`)
  return items.map(toMyClassSummary)
}

interface AuditLogEntryApi {
  changed_at: string
  student_name: string
  changed_by_name: string
  previous_status: AttendanceStatus
  new_status: AttendanceStatus
}

function toAuditLogEntry(api: AuditLogEntryApi): AuditLogEntry {
  return {
    changedAt: api.changed_at,
    studentName: api.student_name,
    changedByName: api.changed_by_name,
    previousStatus: api.previous_status,
    newStatus: api.new_status,
  }
}

export async function getAuditLog(classroomId: string, date: string): Promise<AuditLogEntry[]> {
  const items = await apiFetch<AuditLogEntryApi[]>(
    `/attendance/audit-log?classroom_id=${classroomId}&date=${date}`,
  )
  return items.map(toAuditLogEntry)
}
```

In `src/features/attendance/actions/index.ts`, change the export line to:

```ts
export { getRoster, markAttendance, bulkMarkAttendance, getMyClasses, getAuditLog } from './attendance.action'
```

- [ ] **Step 3: Extend the hooks**

In `src/features/attendance/hooks/use-attendance.ts`, add the import `getMyClasses, getAuditLog` to the existing `import { getRoster } from '../actions'` line, and append:

```ts
export function useMyClasses(date: string) {
  return useQuery({ queryKey: ['my-classes', date], queryFn: () => getMyClasses(date) })
}

export function useAuditLog(classroomId: string, date: string) {
  return useQuery({
    queryKey: ['audit-log', classroomId, date],
    queryFn: () => getAuditLog(classroomId, date),
    enabled: !!classroomId,
  })
}
```

- [ ] **Step 4: Build the roster row component**

```tsx
// src/features/attendance/components/roster-row.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { avatarColor, initials } from '@/lib/avatar'
import type { AttendanceStatus, RosterEntry } from '../types'

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
}

interface RosterRowProps {
  entry: RosterEntry
  pending: boolean
  onMark: (status: AttendanceStatus, note?: string) => void
}

export function RosterRow({ entry, pending, onMark }: RosterRowProps) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(entry.note ?? '')

  const hasNote = !!entry.note
  const canNote = entry.status !== null

  return (
    <div className="border-b last:border-b-0 px-5 py-3" style={{ borderColor: 'var(--hn-line-2)' }}>
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="w-[34px] h-[34px] rounded-full flex-none flex items-center justify-center text-[13px] font-bold text-white"
          style={{ background: avatarColor(entry.studentId) }}
        >
          {initials(entry.studentName)}
        </div>
        <div className="flex-1 min-w-[150px]">
          <div className="text-[15px] font-bold truncate">{entry.studentName}</div>
        </div>
        <div className="flex gap-1.5 min-w-[180px]">
          {(['present', 'late', 'absent'] as const).map((status) => {
            const active = entry.status === status
            return (
              <button
                key={status}
                type="button"
                disabled={pending}
                onClick={() => onMark(status, entry.note ?? undefined)}
                className="flex-1 text-[13px] font-bold rounded-[9px] py-2 border disabled:opacity-60"
                style={
                  active
                    ? { background: 'var(--hn-clay)', color: '#fff', borderColor: 'var(--hn-clay)' }
                    : { background: 'var(--hn-surface)', color: 'var(--hn-sub)', borderColor: 'var(--hn-line)' }
                }
              >
                {STATUS_LABEL[status]}
              </button>
            )
          })}
        </div>
        <div className="flex-none">
          <Button variant="outline" size="sm" disabled={!canNote} onClick={() => setNoteOpen((v) => !v)}>
            {hasNote ? 'Edit note' : 'Note'}
          </Button>
        </div>
      </div>
      {noteOpen && (
        <div className="flex gap-2 mt-2.5 pl-[46px]">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="e.g. picked up early by uncle"
            className="flex-1 text-[13px] rounded-[9px] px-3 py-2 border"
            style={{ borderColor: 'var(--hn-line)', background: 'var(--hn-surface-2)' }}
          />
          <Button
            size="sm"
            disabled={pending || !entry.status}
            onClick={() => {
              if (entry.status) onMark(entry.status, noteDraft)
              setNoteOpen(false)
            }}
          >
            Done
          </Button>
        </div>
      )}
      {!noteOpen && hasNote && (
        <div className="mt-2 pl-[46px] text-xs italic" style={{ color: 'var(--hn-sub)' }}>
          &ldquo;{entry.note}&rdquo;
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Rewrite the attendance screen**

Replace the full content of `src/features/attendance/components/attendance-screen.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useMyClasses, useRoster, useAuditLog } from '../hooks/use-attendance'
import { markAttendance, bulkMarkAttendance } from '../actions'
import { RosterRow } from './roster-row'
import type { AttendanceStatus } from '../types'

const today = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function AttendanceScreen() {
  const date = today()
  const classesQuery = useMyClasses(date)
  const [classroomId, setClassroomId] = useState('')
  const rosterQuery = useRoster(classroomId, date)
  const auditLogQuery = useAuditLog(classroomId, date)
  const queryClient = useQueryClient()
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null)
  const [isBulkPending, setIsBulkPending] = useState(false)
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false)

  const activeClass = classesQuery.data?.find((c) => c.classroomId === classroomId)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['roster', classroomId, date] })
    queryClient.invalidateQueries({ queryKey: ['my-classes', date] })
    queryClient.invalidateQueries({ queryKey: ['audit-log', classroomId, date] })
  }

  const onMark = async (studentId: string, status: AttendanceStatus, note?: string) => {
    setPendingStudentId(studentId)
    try {
      const result = await markAttendance(studentId, classroomId, date, status, note)
      if (result.error) {
        toast.error(result.error)
        return
      }
      invalidateAll()
    } finally {
      setPendingStudentId(null)
    }
  }

  const onMarkAllPresent = async () => {
    const studentIds = rosterQuery.data?.filter((r) => !r.status).map((r) => r.studentId) ?? []
    if (studentIds.length === 0) return
    setIsBulkPending(true)
    try {
      const result = await bulkMarkAttendance(studentIds, classroomId, date, 'present')
      if (result.error) {
        toast.error(result.error)
        return
      }
      invalidateAll()
    } finally {
      setIsBulkPending(false)
    }
  }

  const roster = rosterQuery.data ?? []
  const counts = {
    present: roster.filter((r) => r.status === 'present').length,
    late: roster.filter((r) => r.status === 'late').length,
    absent: roster.filter((r) => r.status === 'absent').length,
    unmarked: roster.filter((r) => !r.status).length,
  }

  return (
    <PageShell heading="Today's attendance" description={date}>
      {classesQuery.isPending || classesQuery.isError ? (
        <QueryState
          isPending={classesQuery.isPending}
          message="Couldn't load your classes."
          onRetry={() => classesQuery.refetch()}
        />
      ) : classesQuery.data.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--hn-sub)' }}>
          You have no classes assigned yet.
        </p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
          <div
            className="rounded-xl p-4 h-fit"
            style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)', boxShadow: 'var(--hn-elev-sm)' }}
          >
            <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--hn-sub)' }}>
              My classes today
            </div>
            <div className="flex flex-col gap-1.5">
              {classesQuery.data.map((c) => {
                const on = c.classroomId === classroomId
                const done = c.unmarkedCount === 0
                return (
                  <button
                    key={c.classroomId}
                    type="button"
                    onClick={() => setClassroomId(c.classroomId)}
                    className="text-left rounded-xl px-3 py-2.5 border flex items-center gap-2.5"
                    style={
                      on
                        ? { background: 'var(--hn-clay)', borderColor: 'var(--hn-clay)', color: '#fff' }
                        : { background: 'var(--hn-surface)', borderColor: 'var(--hn-line)', color: 'var(--hn-ink)' }
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{c.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: on ? 'rgba(255,255,255,0.75)' : 'var(--hn-sub)' }}>
                        {c.gradeLabel ? `${c.gradeLabel} · ` : ''}
                        {c.studentCount} students
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
                      style={
                        done
                          ? { background: 'var(--hn-success)', color: '#fff' }
                          : { background: 'var(--hn-line-2)', color: 'var(--hn-neutral)' }
                      }
                    >
                      {done ? 'Done' : `${c.unmarkedCount} left`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {!classroomId ? (
            <p className="text-sm" style={{ color: 'var(--hn-sub)' }}>
              Pick a class to take attendance.
            </p>
          ) : rosterQuery.isPending || rosterQuery.isError ? (
            <QueryState
              isPending={rosterQuery.isPending}
              message="Couldn't load the roster."
              onRetry={() => rosterQuery.refetch()}
            />
          ) : (
            <div className="flex flex-col gap-4 min-w-0">
              <div
                className="rounded-xl p-6"
                style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)', boxShadow: 'var(--hn-elev)' }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--hn-clay)' }}>
                      Today&apos;s class
                    </div>
                    <div className="text-[34px] font-extrabold tracking-tight leading-none">{activeClass?.name}</div>
                  </div>
                  <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
                    <div className="flex gap-2">
                      <Button disabled={isBulkPending || counts.unmarked === 0} onClick={() => setConfirmBulkOpen(true)}>
                        Mark all present
                      </Button>
                    </div>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark remaining students present?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This marks the {counts.unmarked} still-unmarked students present and notifies their
                          linked parents. Students already marked today are left as-is.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setConfirmBulkOpen(false)
                            void onMarkAllPresent()
                          }}
                        >
                          Mark all present
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex mt-5 pt-4" style={{ borderTop: '1px solid var(--hn-line-2)' }}>
                  {(
                    [
                      { key: 'present', label: 'Present', color: 'var(--hn-success)' },
                      { key: 'late', label: 'Late', color: 'var(--hn-neutral)' },
                      { key: 'absent', label: 'Absent', color: 'var(--hn-danger)' },
                      { key: 'unmarked', label: 'Unmarked', color: 'var(--hn-sub)' },
                    ] as const
                  ).map((stat, i) => (
                    <div key={stat.key} className="flex-1 px-4" style={i > 0 ? { borderLeft: '1px solid var(--hn-line-2)' } : undefined}>
                      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--hn-sub)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: stat.color }} />
                        {stat.label}
                      </div>
                      <div className="font-mono text-[28px] font-semibold" style={{ color: stat.color }}>
                        {counts[stat.key]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)', boxShadow: 'var(--hn-elev)' }}
              >
                {roster.map((entry) => (
                  <RosterRow
                    key={entry.studentId}
                    entry={entry}
                    pending={pendingStudentId === entry.studentId}
                    onMark={(status, note) => onMark(entry.studentId, status, note)}
                  />
                ))}
                <div className="px-5 py-3.5 text-xs" style={{ background: 'var(--hn-surface-2)', color: 'var(--hn-sub)' }}>
                  Parents are notified on Telegram the moment you mark their child — unlinked parents are skipped.
                </div>
              </div>

              <div
                className="rounded-xl p-5"
                style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)', boxShadow: 'var(--hn-elev)' }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide mb-2.5" style={{ color: 'var(--hn-sub)' }}>
                  Change log
                </div>
                {auditLogQuery.isPending ? (
                  <p className="text-sm" style={{ color: 'var(--hn-sub)' }}>
                    Loading…
                  </p>
                ) : auditLogQuery.data && auditLogQuery.data.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {auditLogQuery.data.map((e, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="font-mono text-xs w-[70px] flex-none" style={{ color: 'var(--hn-sub)' }}>
                          {new Date(e.changedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span>
                          {e.changedByName} changed {e.studentName} from {e.previousStatus} to {e.newStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--hn-sub)' }}>
                    Nothing changed yet today.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Manual check with the backend running and seeded: log in as `teacher@attendance.dev`, land on `/attendance`, confirm the sidebar shows "Grade 3A" with a correct student count and "N left"/"Done" pill; select it, confirm the stat ledger, roster rows with avatar+3-button toggle+note, and (after marking at least one student, then re-marking them to a different status to generate an audit entry) the change log populate correctly; confirm "Mark all present" only fills the still-unmarked rows, leaving any already-marked row untouched.

- [ ] **Step 7: Commit**

```bash
git add src/features/attendance
git commit -m "feat(attendance): redesign teacher dashboard with class sidebar, stat ledger, notes, audit log"
```

---

## Task 7: Admin Classrooms & Students screens — restyle (frontend)

Depends on: Task 5.

**Files:**
- Modify: `src/features/classrooms/components/classrooms-screen.tsx` (full rewrite: card+avatar rows)
- Modify: `src/features/students/components/students-screen.tsx` (full rewrite: card+avatar rows, stat tiles, search, `StatusChip`)

**Interfaces:**
- Consumes: `avatarColor`, `initials` from `@/lib/avatar` (Task 5); `StatusChip` from `@/components/shared/status-chip` (Task 5, now supports `linked`/`unlinked`/`checking`).

- [ ] **Step 1: Rewrite the classrooms screen**

Replace the full content of `src/features/classrooms/components/classrooms-screen.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { avatarColor, initials } from '@/lib/avatar'
import { useClassrooms } from '../hooks/use-classrooms'
import { createClassroom, deleteClassroom } from '../actions'
import { classroomSchema, type ClassroomInput } from '../schemas'

export function ClassroomsScreen() {
  const query = useClassrooms()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ClassroomInput>({
    resolver: zodResolver(classroomSchema),
    defaultValues: { name: '', gradeLabel: '' },
  })

  const onSubmit = async (values: ClassroomInput) => {
    setIsSubmitting(true)
    const result = await createClassroom(values)
    setIsSubmitting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    form.reset({ name: '', gradeLabel: '' })
    await queryClient.invalidateQueries({ queryKey: ['classrooms'] })
  }

  const onDelete = async (id: string) => {
    const result = await deleteClassroom(id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['classrooms'] })
  }

  return (
    <PageShell heading="Classrooms" description="Create classes and assign teachers.">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex gap-2 items-end rounded-xl p-4"
          style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Grade 3A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gradeLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Grade</FormLabel>
                <FormControl>
                  <Input placeholder="Grade 3" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isSubmitting}>
            Add classroom
          </Button>
        </form>
      </Form>

      {query.isPending || query.isError ? (
        <QueryState isPending={query.isPending} message="Couldn't load classrooms." onRetry={() => query.refetch()} />
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
          {query.data.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-5 py-3.5"
              style={i > 0 ? { borderTop: '1px solid var(--hn-line-2)' } : undefined}
            >
              <div
                className="w-9 h-9 rounded-full flex-none flex items-center justify-center text-sm font-bold text-white"
                style={{ background: avatarColor(c.id) }}
              >
                {initials(c.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{c.name}</div>
                {c.gradeLabel && (
                  <div className="text-xs" style={{ color: 'var(--hn-sub)' }}>
                    {c.gradeLabel}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onDelete(c.id)}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 2: Rewrite the students screen**

Replace the full content of `src/features/students/components/students-screen.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { avatarColor, initials } from '@/lib/avatar'
import { useClassrooms } from '@/features/classrooms/hooks/use-classrooms'
import { useStudents, useLinkingStatus } from '../hooks/use-students'
import { createStudent, deleteStudent, generateLinkingCode } from '../actions'
import { studentSchema, type StudentInput } from '../schemas'

export function StudentsScreen() {
  const classroomsQuery = useClassrooms()
  const studentsQuery = useStudents()
  const linkingQuery = useLinkingStatus()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  const form = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: { name: '', classroomId: '' },
  })

  const classroomName = (id: string) => classroomsQuery.data?.find((c) => c.id === id)?.name ?? id
  const linkingByStudent = new Map((linkingQuery.data ?? []).map((l) => [l.studentId, l]))
  const linkedCount = (linkingQuery.data ?? []).filter((l) => l.linked).length

  const visibleStudents = (studentsQuery.data ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const onSubmit = async (values: StudentInput) => {
    setIsSubmitting(true)
    const result = await createStudent(values)
    setIsSubmitting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    form.reset({ name: '', classroomId: '' })
    await queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  const onDelete = async (id: string) => {
    const result = await deleteStudent(id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  const onGenerateCode = async (studentId: string) => {
    const result = await generateLinkingCode(studentId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Linking code: ${result.code}`)
    await queryClient.invalidateQueries({ queryKey: ['linking-status'] })
  }

  return (
    <PageShell heading="Students" description="Add students and generate parent linking codes.">
      <div className="flex gap-3">
        <div className="rounded-xl px-5 py-4 min-w-[140px]" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
          <div className="font-mono text-[28px] font-semibold">{studentsQuery.data?.length ?? 0}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--hn-sub)' }}>
            Total students
          </div>
        </div>
        <div className="rounded-xl px-5 py-4 min-w-[140px]" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
          <div className="font-mono text-[28px] font-semibold" style={{ color: 'var(--hn-success)' }}>
            {linkedCount}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--hn-sub)' }}>
            Linked
          </div>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex gap-2 items-end rounded-xl p-4"
          style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Sokha" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="classroomId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Classroom</FormLabel>
                <FormControl>
                  <select className="h-9 rounded-md border bg-background px-3 text-sm" {...field}>
                    <option value="">Select a classroom</option>
                    {classroomsQuery.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isSubmitting}>
            Add student
          </Button>
        </form>
      </Form>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="max-w-[240px]" />

      {studentsQuery.isPending || studentsQuery.isError ? (
        <QueryState isPending={studentsQuery.isPending} message="Couldn't load students." onRetry={() => studentsQuery.refetch()} />
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
          {visibleStudents.map((s, i) => {
            const linking = linkingByStudent.get(s.id)
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={i > 0 ? { borderTop: '1px solid var(--hn-line-2)' } : undefined}
              >
                <div
                  className="w-9 h-9 rounded-full flex-none flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: avatarColor(s.id) }}
                >
                  {initials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{s.name}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--hn-sub)' }}>
                    {classroomName(s.classroomId)}
                  </div>
                </div>
                {linkingQuery.isPending || linkingQuery.isError ? (
                  <StatusChip status="checking" />
                ) : linking?.linked ? (
                  <StatusChip status="linked" />
                ) : (
                  <StatusChip status="unlinked" label={linking?.activeCode ? `Unlinked · ${linking.activeCode}` : 'Unlinked'} />
                )}
                <span className="flex gap-2 flex-none">
                  <Button variant="outline" size="sm" onClick={() => onGenerateCode(s.id)}>
                    Generate code
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(s.id)}>
                    Delete
                  </Button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Manual check: log in as admin, confirm `/classrooms` and `/students` render as card-list rows with colored avatar circles, the two stat tiles on `/students` show correct counts, search filters the list live, and the "Unlinked · CODE" / "Linked" chip renders correctly for both states.

- [ ] **Step 4: Commit**

```bash
git add src/features/classrooms/components/classrooms-screen.tsx src/features/students/components/students-screen.tsx
git commit -m "feat(admin): restyle classrooms and students screens to Rollcall palette"
```

---

## Task 8: Admin Linking codes screen (frontend, no new backend)

Depends on: Task 5, Task 7 (reuses `students`/`classrooms` hooks and actions already in the codebase — `getLinkingStatus`/`generateLinkingCode` already exist and already return everything this screen needs, per the verified backend report).

**Files:**
- Create: `src/features/students/components/linking-codes-screen.tsx`
- Create: `src/app/(dashboard)/linking-codes/page.tsx`

**Note (deviation):** this repo's own `CLAUDE.md` originally planned linking codes to fold into the students detail view rather than be a top-level nav tab — this task deliberately promotes it to a standalone screen per the Rollcall spec's "Admin — Linking codes" section, reusing the `students` feature slice's existing hooks/actions rather than duplicating them into a new slice (no new `src/features/linking/` directory).

- [ ] **Step 1: Build the screen**

```tsx
// src/features/students/components/linking-codes-screen.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { useClassrooms } from '@/features/classrooms/hooks/use-classrooms'
import { useStudents, useLinkingStatus } from '../hooks/use-students'
import { generateLinkingCode } from '../actions'

export function LinkingCodesScreen() {
  const classroomsQuery = useClassrooms()
  const studentsQuery = useStudents()
  const linkingQuery = useLinkingStatus()
  const queryClient = useQueryClient()
  const [unlinkedOnly, setUnlinkedOnly] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const classroomName = (id: string) => classroomsQuery.data?.find((c) => c.id === id)?.name ?? id
  const linkingByStudent = new Map((linkingQuery.data ?? []).map((l) => [l.studentId, l]))

  const onRegenerate = async (studentId: string) => {
    const result = await generateLinkingCode(studentId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`New code: ${result.code}`)
    await queryClient.invalidateQueries({ queryKey: ['linking-status'] })
  }

  const onCopy = async (studentId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // Clipboard access can be denied by the browser; the code is still
      // visible on screen for the admin to copy by hand.
    }
    setCopiedId(studentId)
    setTimeout(() => setCopiedId((id) => (id === studentId ? null : id)), 1800)
  }

  const isPending = studentsQuery.isPending || linkingQuery.isPending
  const isError = studentsQuery.isError || linkingQuery.isError

  const cards = (studentsQuery.data ?? [])
    .map((s) => ({ student: s, linking: linkingByStudent.get(s.id) }))
    .filter(({ linking }) => (unlinkedOnly ? !linking?.linked : true))

  return (
    <PageShell
      heading="Parent linking codes"
      description="Give a parent their child's code — they message the school's Telegram bot with /link CODE."
    >
      <div className="flex items-center gap-2">
        <Button variant={unlinkedOnly ? 'default' : 'outline'} size="sm" onClick={() => setUnlinkedOnly((v) => !v)}>
          Unlinked only
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Print sheet
        </Button>
      </div>

      {isPending || isError ? (
        <QueryState
          isPending={isPending}
          message="Couldn't load linking codes."
          onRetry={() => {
            studentsQuery.refetch()
            linkingQuery.refetch()
          }}
        />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {cards.map(({ student, linking }) => (
            <div
              key={student.id}
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{student.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--hn-sub)' }}>
                    {classroomName(student.classroomId)}
                  </div>
                </div>
                <StatusChip status={linking?.linked ? 'linked' : 'unlinked'} bare />
              </div>
              {linking?.activeCode ? (
                <div
                  className="rounded-xl py-3 text-center font-mono text-[22px] font-semibold tracking-[0.12em]"
                  style={{ background: 'var(--hn-surface-2)', border: '1px dashed var(--hn-line)' }}
                >
                  {linking.activeCode}
                </div>
              ) : (
                <div className="text-xs" style={{ color: 'var(--hn-sub)' }}>
                  {linking?.linked ? 'Already linked — generate a new code to re-link elsewhere.' : 'No active code.'}
                </div>
              )}
              <div className="flex gap-2">
                {linking?.activeCode && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => onCopy(student.id, linking.activeCode!)}>
                    {copiedId === student.id ? 'Copied' : 'Copy code'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onRegenerate(student.id)}>
                  New code
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
```

```tsx
// src/app/(dashboard)/linking-codes/page.tsx
import type { Metadata } from 'next'
import { LinkingCodesScreen } from '@/features/students/components/linking-codes-screen'

export const metadata: Metadata = { title: 'Linking codes — Attendance' }

export default function LinkingCodesPage() {
  return <LinkingCodesScreen />
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Manual check: as admin, click "Linking codes" in the nav, confirm the card grid renders one card per student with a dashed code box, "Unlinked only" toggles the filter, "Copy code" copies to clipboard and shows "Copied" for ~1.8s, "New code" regenerates and updates the card.

- [ ] **Step 3: Commit**

```bash
git add src/features/students/components/linking-codes-screen.tsx "src/app/(dashboard)/linking-codes"
git commit -m "feat(admin): add parent linking-codes screen"
```

---

## Task 9: Admin Staff screen (frontend, new slice)

Depends on: Task 2 (backend `/staff` endpoints), Task 5 (`avatarColor`/`initials`, tokens).

**Files:**
- Create: `src/features/staff/types.ts`
- Create: `src/features/staff/schemas/teacher.schema.ts`
- Create: `src/features/staff/schemas/index.ts`
- Create: `src/features/staff/actions/staff.action.ts`
- Create: `src/features/staff/actions/index.ts`
- Create: `src/features/staff/hooks/use-staff.ts`
- Create: `src/features/staff/components/staff-screen.tsx`
- Create: `src/app/(dashboard)/staff/page.tsx`

**Interfaces:**
- Consumes: `useClassrooms` from `@/features/classrooms/hooks/use-classrooms` (existing, unchanged); the existing `PATCH /classrooms/:id` endpoint (via a raw `apiFetch` call) to assign the newly-created teacher to a classroom in the same submit flow.
- Produces: `useTeachers()` hook, `Teacher` type — used only by this task.

- [ ] **Step 1: Types and schema**

```ts
// src/features/staff/types.ts
export interface Teacher {
  id: string
  name: string
  email: string
  classroomNames: string[]
}
```

```ts
// src/features/staff/schemas/teacher.schema.ts
import { z } from 'zod'

export const teacherSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  classroomId: z.string().optional(),
})

export type TeacherInput = z.infer<typeof teacherSchema>
```

```ts
// src/features/staff/schemas/index.ts
export { teacherSchema, type TeacherInput } from './teacher.schema'
```

- [ ] **Step 2: Actions**

```ts
// src/features/staff/actions/staff.action.ts
'use server'

import { revalidatePath } from 'next/cache'
import { ApiError, apiFetch } from '@/lib/api/server'
import type { Teacher } from '../types'
import type { TeacherInput } from '../schemas'

interface TeacherApi {
  id: string
  name: string
  email: string
  classroom_names: string[]
}

function toTeacher(api: TeacherApi): Teacher {
  return { id: api.id, name: api.name, email: api.email, classroomNames: api.classroom_names }
}

export async function listTeachers(): Promise<Teacher[]> {
  const items = await apiFetch<TeacherApi[]>('/staff')
  return items.map(toTeacher)
}

interface CreateTeacherApi {
  id: string
  name: string
  email: string
  temporary_password: string
}

export async function createTeacher(input: TeacherInput): Promise<{ temporaryPassword?: string; error?: string }> {
  let created: CreateTeacherApi
  try {
    created = await apiFetch<CreateTeacherApi>('/staff', {
      method: 'POST',
      body: JSON.stringify({ name: input.name, email: input.email }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to add teacher' }
  }

  if (input.classroomId) {
    try {
      await apiFetch(`/classrooms/${input.classroomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ teacher_id: created.id }),
      })
    } catch {
      // Teacher account was created; the classroom assignment failing isn't
      // fatal — the admin can assign it from the Classrooms screen instead.
    }
  }

  revalidatePath('/staff')
  revalidatePath('/classrooms')
  return { temporaryPassword: created.temporary_password }
}

export async function deleteTeacher(id: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/staff/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to remove teacher' }
  }
  revalidatePath('/staff')
  return {}
}
```

```ts
// src/features/staff/actions/index.ts
export { listTeachers, createTeacher, deleteTeacher } from './staff.action'
```

- [ ] **Step 3: Hook**

```ts
// src/features/staff/hooks/use-staff.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { listTeachers } from '../actions'

export function useTeachers() {
  return useQuery({ queryKey: ['teachers'], queryFn: listTeachers })
}
```

- [ ] **Step 4: Screen**

```tsx
// src/features/staff/components/staff-screen.tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { avatarColor, initials } from '@/lib/avatar'
import { useClassrooms } from '@/features/classrooms/hooks/use-classrooms'
import { useTeachers } from '../hooks/use-staff'
import { createTeacher, deleteTeacher } from '../actions'
import { teacherSchema, type TeacherInput } from '../schemas'

export function StaffScreen() {
  const classroomsQuery = useClassrooms()
  const teachersQuery = useTeachers()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<TeacherInput>({
    resolver: zodResolver(teacherSchema),
    defaultValues: { name: '', email: '', classroomId: '' },
  })

  const onSubmit = async (values: TeacherInput) => {
    setIsSubmitting(true)
    const result = await createTeacher(values)
    setIsSubmitting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Teacher added. Temporary password: ${result.temporaryPassword}`)
    form.reset({ name: '', email: '', classroomId: '' })
    await queryClient.invalidateQueries({ queryKey: ['teachers'] })
    await queryClient.invalidateQueries({ queryKey: ['classrooms'] })
  }

  const onDelete = async (id: string) => {
    const result = await deleteTeacher(id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['teachers'] })
  }

  return (
    <PageShell heading="Staff" description="Add teacher accounts and see what each one teaches.">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex gap-2 items-end flex-wrap rounded-xl p-4"
          style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Chenda Ly" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="chenda@school.edu" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="classroomId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Classroom</FormLabel>
                <FormControl>
                  <select className="h-9 rounded-md border bg-background px-3 text-sm" {...field}>
                    <option value="">Unassigned</option>
                    {classroomsQuery.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isSubmitting}>
            Add teacher
          </Button>
        </form>
      </Form>

      {teachersQuery.isPending || teachersQuery.isError ? (
        <QueryState isPending={teachersQuery.isPending} message="Couldn't load staff." onRetry={() => teachersQuery.refetch()} />
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
          {teachersQuery.data.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-5 py-3.5"
              style={i > 0 ? { borderTop: '1px solid var(--hn-line-2)' } : undefined}
            >
              <div
                className="w-9 h-9 rounded-full flex-none flex items-center justify-center text-sm font-bold text-white"
                style={{ background: avatarColor(t.id) }}
              >
                {initials(t.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{t.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--hn-sub)' }}>
                  {t.email}
                </div>
              </div>
              <div className="text-xs w-[200px] truncate" style={{ color: 'var(--hn-sub)' }}>
                {t.classroomNames.length > 0 ? t.classroomNames.join(', ') : 'Unassigned'}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onDelete(t.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
```

```tsx
// src/app/(dashboard)/staff/page.tsx
import type { Metadata } from 'next'
import { StaffScreen } from '@/features/staff/components/staff-screen'

export const metadata: Metadata = { title: 'Staff — Attendance' }

export default function StaffPage() {
  return <StaffScreen />
}
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Manual check: as admin, add a teacher with a classroom selected, confirm the success toast shows a temporary password, the new row appears with the assigned classroom name, and `/classrooms` reflects the new `teacher_id` assignment; remove the teacher and confirm the row disappears.

- [ ] **Step 6: Commit**

```bash
git add src/features/staff "src/app/(dashboard)/staff"
git commit -m "feat(admin): add staff (teacher accounts) screen"
```

---

## Task 10: Admin Reports screen (frontend, new slice)

Depends on: Task 4 (backend `/reports/summary`), Task 5.

**Files:**
- Create: `src/features/reports/types.ts`
- Create: `src/features/reports/actions/reports.action.ts`
- Create: `src/features/reports/actions/index.ts`
- Create: `src/features/reports/hooks/use-reports.ts`
- Create: `src/features/reports/components/reports-screen.tsx`
- Create: `src/app/(dashboard)/reports/page.tsx`

**Interfaces:**
- Produces: `useReportsSummary()` hook, `ReportsSummary`/`StudentReportRow`/`ClassDailySummary` types — used only by this task.

**Deviation:** CSV export is built client-side from the already-fetched report data (`Blob` + `URL.createObjectURL`), same approach as the spec's own prototype — a server-generated CSV would need a new backend endpoint, which isn't justified by this app's scale; noted as a known simplification, not an oversight.

- [ ] **Step 1: Types**

```ts
// src/features/reports/types.ts
export interface StudentReportRow {
  studentId: string
  studentName: string
  classroomName: string
  present: number
  late: number
  absent: number
  ratePct: number
  chronic: boolean
}

export interface ClassDailySummary {
  classroomId: string
  classroomName: string
  present: number
  late: number
  absent: number
  unmarked: number
}

export interface ReportsSummary {
  overallRatePct: number
  chronicCount: number
  dailySummary: ClassDailySummary[]
  studentRows: StudentReportRow[]
}
```

- [ ] **Step 2: Action**

```ts
// src/features/reports/actions/reports.action.ts
'use server'

import { apiFetch } from '@/lib/api/server'
import type { ReportsSummary } from '../types'

interface ReportsSummaryApi {
  overall_rate_pct: number
  chronic_count: number
  daily_summary: {
    classroom_id: string
    classroom_name: string
    present: number
    late: number
    absent: number
    unmarked: number
  }[]
  student_rows: {
    student_id: string
    student_name: string
    classroom_name: string
    present: number
    late: number
    absent: number
    rate_pct: number
    chronic: boolean
  }[]
}

export async function getReportsSummary(): Promise<ReportsSummary> {
  const api = await apiFetch<ReportsSummaryApi>('/reports/summary')
  return {
    overallRatePct: api.overall_rate_pct,
    chronicCount: api.chronic_count,
    dailySummary: api.daily_summary.map((d) => ({
      classroomId: d.classroom_id,
      classroomName: d.classroom_name,
      present: d.present,
      late: d.late,
      absent: d.absent,
      unmarked: d.unmarked,
    })),
    studentRows: api.student_rows.map((r) => ({
      studentId: r.student_id,
      studentName: r.student_name,
      classroomName: r.classroom_name,
      present: r.present,
      late: r.late,
      absent: r.absent,
      ratePct: r.rate_pct,
      chronic: r.chronic,
    })),
  }
}
```

```ts
// src/features/reports/actions/index.ts
export { getReportsSummary } from './reports.action'
```

- [ ] **Step 3: Hook**

```ts
// src/features/reports/hooks/use-reports.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { getReportsSummary } from '../actions'

export function useReportsSummary() {
  return useQuery({ queryKey: ['reports-summary'], queryFn: getReportsSummary })
}
```

- [ ] **Step 4: Screen**

```tsx
// src/features/reports/components/reports-screen.tsx
'use client'

import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { useReportsSummary } from '../hooks/use-reports'
import type { StudentReportRow } from '../types'

function exportCsv(rows: StudentReportRow[]) {
  const header = 'Student,Class,Present,Late,Absent,Attendance %,Chronic\n'
  const body = rows
    .map((r) => [r.studentName, r.classroomName, r.present, r.late, r.absent, r.ratePct, r.chronic ? 'Yes' : 'No'].join(','))
    .join('\n')
  const blob = new Blob([header + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'attendance-report.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsScreen() {
  const query = useReportsSummary()

  return (
    <PageShell heading="Reports" description="Attendance over the last 20 days.">
      {query.isPending || query.isError ? (
        <QueryState isPending={query.isPending} message="Couldn't load reports." onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="flex gap-3">
            <div className="rounded-xl px-5 py-4 min-w-[180px]" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
              <div className="font-mono text-[28px] font-semibold" style={{ color: 'var(--hn-success)' }}>
                {query.data.overallRatePct}%
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--hn-sub)' }}>
                Attendance rate, last 20 days
              </div>
            </div>
            <div className="rounded-xl px-5 py-4 min-w-[180px]" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
              <div
                className="font-mono text-[28px] font-semibold"
                style={{ color: query.data.chronicCount > 0 ? 'var(--hn-danger)' : 'var(--hn-success)' }}
              >
                {query.data.chronicCount}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--hn-sub)' }}>
                Chronic absentees (3+ in window)
              </div>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
            <div className="text-base font-extrabold mb-3.5">Today&apos;s summary by class</div>
            {query.data.dailySummary.map((d, i) => (
              <div key={d.classroomId} className="flex items-center gap-4 py-2.5" style={i > 0 ? { borderTop: '1px solid var(--hn-line-2)' } : undefined}>
                <div className="flex-1 text-sm font-bold">{d.classroomName}</div>
                <div className="font-mono text-[13px] w-[60px]" style={{ color: 'var(--hn-success)' }}>
                  {d.present} P
                </div>
                <div className="font-mono text-[13px] w-[60px]" style={{ color: 'var(--hn-neutral)' }}>
                  {d.late} L
                </div>
                <div className="font-mono text-[13px] w-[60px]" style={{ color: 'var(--hn-danger)' }}>
                  {d.absent} A
                </div>
                <div className="font-mono text-[13px] w-[90px]" style={{ color: 'var(--hn-sub)' }}>
                  {d.unmarked} unmarked
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
            <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--hn-line)' }}>
              <div className="flex-1 text-lg font-extrabold">Per-student attendance</div>
              <Button variant="outline" size="sm" onClick={() => exportCsv(query.data.studentRows)}>
                Export CSV
              </Button>
            </div>
            {query.data.studentRows.map((r, i) => (
              <div key={r.studentId} className="flex items-center gap-3 px-5 py-3" style={i > 0 ? { borderTop: '1px solid var(--hn-line-2)' } : undefined}>
                <span className="flex-1 text-sm font-bold truncate">{r.studentName}</span>
                <span className="text-xs w-[110px]" style={{ color: 'var(--hn-sub)' }}>
                  {r.classroomName}
                </span>
                <span className="font-mono text-[13px] w-[70px]">{r.present}</span>
                <span className="font-mono text-[13px] w-[60px]">{r.late}</span>
                <span className="font-mono text-[13px] w-[70px]">{r.absent}</span>
                <span className="font-mono text-[13px] w-[50px]">{r.ratePct}%</span>
                <span className="w-[90px] flex justify-end">{r.chronic && <StatusChip status="absent" label="Chronic" bare />}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  )
}
```

```tsx
// src/app/(dashboard)/reports/page.tsx
import type { Metadata } from 'next'
import { ReportsScreen } from '@/features/reports/components/reports-screen'

export const metadata: Metadata = { title: 'Reports — Attendance' }

export default function ReportsPage() {
  return <ReportsScreen />
}
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Manual check: as admin, open `/reports`, confirm the two stat tiles, the per-class daily summary, and the per-student table all render with real numbers from the seeded/marked data; click "Export CSV" and confirm a file downloads with the expected header row.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports "src/app/(dashboard)/reports"
git commit -m "feat(admin): add reports screen with CSV export"
```

---

## Task 11: Admin Settings screen (frontend, new slice)

Depends on: Task 1 (backend `/school-settings`), Task 5.

**Files:**
- Create: `src/features/settings/types.ts`
- Create: `src/features/settings/schemas/settings.schema.ts`
- Create: `src/features/settings/schemas/index.ts`
- Create: `src/features/settings/actions/settings.action.ts`
- Create: `src/features/settings/actions/index.ts`
- Create: `src/features/settings/hooks/use-settings.ts`
- Create: `src/features/settings/components/settings-screen.tsx`
- Create: `src/app/(dashboard)/settings/page.tsx`

**Deviation (security, intentional):** the backend's `GET /school-settings` returns the full entity including the raw `telegram_bot_token`. This screen's `getSchoolSettings()` action — which runs server-side — deliberately **drops that field** before returning to client code, exposing only `telegramBotTokenSet: boolean`. The token is never sent to the browser, and the update form is write-only (a blank field means "keep the current token", never "clear it" — matches Task 1's handler logic). This is a meaningful improvement over the spec's own prototype, which keeps the live token in client-side state.

- [ ] **Step 1: Types and schema**

```ts
// src/features/settings/types.ts
export interface SchoolSettings {
  schoolName: string
  lateCutoffMinutes: number
  absenceMessageTemplate: string
  telegramBotTokenSet: boolean
}
```

```ts
// src/features/settings/schemas/settings.schema.ts
import { z } from 'zod'

export const settingsSchema = z.object({
  schoolName: z.string().min(1, 'School name is required'),
  // A required numeric field bound to an <input type="number">, which RHF
  // delivers as a string — z.coerce is the correct tool here regardless of
  // this repo's general caution around it for *optional* fields; this one
  // is required, so `exactOptionalPropertyTypes` doesn't interact with it.
  lateCutoffMinutes: z.coerce.number().int().min(0, 'Must be 0 or more'),
  absenceMessageTemplate: z.string().min(1, 'Template is required'),
  telegramBotToken: z.string().optional(),
})

export type SettingsInput = z.infer<typeof settingsSchema>
```

```ts
// src/features/settings/schemas/index.ts
export { settingsSchema, type SettingsInput } from './settings.schema'
```

- [ ] **Step 2: Actions**

```ts
// src/features/settings/actions/settings.action.ts
'use server'

import { revalidatePath } from 'next/cache'
import { ApiError, apiFetch } from '@/lib/api/server'
import type { SchoolSettings } from '../types'
import type { SettingsInput } from '../schemas'

interface SchoolSettingsApi {
  school_name: string
  late_cutoff_minutes: number
  absence_message_template: string
  telegram_bot_token: string | null
}

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const api = await apiFetch<SchoolSettingsApi>('/school-settings')
  return {
    schoolName: api.school_name,
    lateCutoffMinutes: api.late_cutoff_minutes,
    absenceMessageTemplate: api.absence_message_template,
    telegramBotTokenSet: !!api.telegram_bot_token,
  }
}

export async function updateSchoolSettings(input: SettingsInput): Promise<{ error?: string }> {
  try {
    await apiFetch('/school-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        school_name: input.schoolName,
        late_cutoff_minutes: input.lateCutoffMinutes,
        absence_message_template: input.absenceMessageTemplate,
        ...(input.telegramBotToken ? { telegram_bot_token: input.telegramBotToken } : {}),
      }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to save settings' }
  }
  revalidatePath('/settings')
  return {}
}
```

```ts
// src/features/settings/actions/index.ts
export { getSchoolSettings, updateSchoolSettings } from './settings.action'
```

- [ ] **Step 3: Hook**

```ts
// src/features/settings/hooks/use-settings.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { getSchoolSettings } from '../actions'

export function useSchoolSettings() {
  return useQuery({ queryKey: ['school-settings'], queryFn: getSchoolSettings })
}
```

- [ ] **Step 4: Screen**

```tsx
// src/features/settings/components/settings-screen.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useSchoolSettings } from '../hooks/use-settings'
import { updateSchoolSettings } from '../actions'
import { settingsSchema, type SettingsInput } from '../schemas'

export function SettingsScreen() {
  const query = useSchoolSettings()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { schoolName: '', lateCutoffMinutes: 15, absenceMessageTemplate: '', telegramBotToken: '' },
  })

  useEffect(() => {
    if (query.data) {
      form.reset({
        schoolName: query.data.schoolName,
        lateCutoffMinutes: query.data.lateCutoffMinutes,
        absenceMessageTemplate: query.data.absenceMessageTemplate,
        telegramBotToken: '',
      })
    }
  }, [query.data, form])

  const onSubmit = async (values: SettingsInput) => {
    setIsSubmitting(true)
    const result = await updateSchoolSettings(values)
    setIsSubmitting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Settings saved')
    form.setValue('telegramBotToken', '')
    await queryClient.invalidateQueries({ queryKey: ['school-settings'] })
  }

  if (query.isPending || query.isError) {
    return (
      <PageShell heading="Settings">
        <QueryState isPending={query.isPending} message="Couldn't load settings." onRetry={() => query.refetch()} />
      </PageShell>
    )
  }

  return (
    <PageShell heading="Settings" description="School details, notifications, and the Telegram bot.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-[640px]">
          <div className="rounded-xl p-5" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
            <div className="text-base font-extrabold mb-3.5">School</div>
            <FormField
              control={form.control}
              name="schoolName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>School name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
            <div className="text-base font-extrabold mb-3.5">Notifications</div>
            <FormField
              control={form.control}
              name="lateCutoffMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Late cutoff (minutes after class start)</FormLabel>
                  <FormControl>
                    <Input type="number" className="w-[100px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="absenceMessageTemplate"
              render={({ field }) => (
                <FormItem className="mt-3.5">
                  <FormLabel>Absence message template</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={3}
                      className="w-full rounded-md border px-3 py-2 text-sm resize-none"
                      style={{ borderColor: 'var(--hn-line)', background: 'var(--hn-surface-2)' }}
                    />
                  </FormControl>
                  <p className="text-xs mt-1" style={{ color: 'var(--hn-sub)' }}>
                    Use <code>{'{{student_name}}'}</code> to insert the student&apos;s name.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--hn-surface)', border: '1px solid var(--hn-line)' }}>
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="text-base font-extrabold flex-1">Telegram bot</div>
              <StatusChip
                status={query.data.telegramBotTokenSet ? 'linked' : 'unlinked'}
                label={query.data.telegramBotTokenSet ? 'Connected' : 'Not set'}
              />
            </div>
            <FormField
              control={form.control}
              name="telegramBotToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bot token</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        {...field}
                        type={showToken ? 'text' : 'password'}
                        placeholder={query.data.telegramBotTokenSet ? '••••••••••••' : 'Paste a new token'}
                        className="flex-1 font-mono"
                      />
                    </FormControl>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowToken((v) => !v)}>
                      {showToken ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--hn-sub)' }}>
                    Leave blank to keep the current token.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              Save settings
            </Button>
          </div>
        </form>
      </Form>
    </PageShell>
  )
}
```

```tsx
// src/app/(dashboard)/settings/page.tsx
import type { Metadata } from 'next'
import { SettingsScreen } from '@/features/settings/components/settings-screen'

export const metadata: Metadata = { title: 'Settings — Attendance' }

export default function SettingsPage() {
  return <SettingsScreen />
}
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit`
Expected: both clean.

Manual check: as admin, open `/settings`, confirm the form pre-fills with the current (default, on first load) settings, the Telegram card shows "Not set"; save with the bot-token field left blank and confirm the school name/cutoff/template persisted while the token status is unaffected; save again with a token typed in, reload the page, and confirm the status flips to "Connected" and the field shows the placeholder dots (not the real value).

- [ ] **Step 6: Commit**

```bash
git add src/features/settings "src/app/(dashboard)/settings"
git commit -m "feat(admin): add settings screen"
```

- [ ] **Step 7: Full-app verification and push**

Run `npm run build` (production build must succeed with zero type errors across every new route). Then, with the backend running and seeded (Tasks 1–4's endpoints live), click through every nav item as both `admin@attendance.dev` and `teacher@attendance.dev` and confirm no console errors, no broken layout in light or dark mode, and that the whole app now reads as one consistent blue/IBM-Plex-Mono design system rather than a mix of old and new styling.

```bash
git push -u origin worktree-rollcall
```

## Unresolved questions

- **Recommended:** none blocking — every open question from the design-import phase (palette-vs-Hang-Neak, full-stack-vs-phased scope) was already resolved with the user before this plan was written. The one soft call worth a final look before merging: whether `lateCutoffMinutes` should eventually *drive* an automatic present→late transition (it's currently informational only, per Global Constraints) — flagged as a natural next-phase feature, not something this plan silently half-implements.

