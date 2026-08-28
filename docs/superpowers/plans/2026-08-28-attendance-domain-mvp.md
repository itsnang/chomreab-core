# Attendance Domain MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the thin vertical slice on top of the already-scaffolded `attendance-api`/`attendance-admin` projects: classroom/student CRUD, attendance marking with an edit audit log, parent linking codes, a Telegram bot (`/start`, `/link`, `/status`) and attendance→parent notifications, plus the matching admin/teacher screens.

**Architecture:** Backend follows the existing modular-monolith CQRS layout (`api/application/domain/infrastructure` per module) already established in `attendance-api/CLAUDE.md`. Simple CRUD modules (`classroom`, `student`, `parent-link`) skip `domain/`; `attendance` uses a real domain event (`AttendanceMarkedEvent`) because re-marking a day is a genuine business rule (audit log). Frontend follows the existing feature-slice layout in `attendance-admin/CLAUDE.md`.

**Tech Stack:** NestJS 11 + `@nestjs/cqrs` + TypeORM + PostgreSQL (backend, port 8091); Next.js 16 App Router + shadcn/ui + TanStack Query v5 + React Hook Form + Zod (frontend, port 3001).

**Spec:** No separate committed spec doc — this plan was scoped directly from the approved Plan Mode design (see conversation) after the scaffold phase (`attendance-api`/`attendance-admin` cloned from `hang-neak-api`/`hang-neak-admin-web-mobile`, auth verified end-to-end). This plan doc is the spec of record going forward.

## Global Constraints

- Never use the `any` type anywhere (user's global rule) — this includes test mocks; type them explicitly or with `unknown`/generics.
- All wire-format DTOs (request bodies, response JSON) use `snake_case` field names. TS domain code uses `camelCase`. The `SnakeCaseInterceptor` auto-converts outbound `camelCase → snake_case`; there is **no** automatic inbound conversion, so every request DTO class must declare its properties in `snake_case` directly (see `RefreshTokenDto.refresh_token` for precedent).
- IDs are app-generated UUIDs: `crypto.randomUUID()` + `@PrimaryColumn('uuid')`, never `@PrimaryGeneratedColumn`.
- Every controller route is guarded: `@UseGuards(JwtAuthGuard, RolesGuard)` at the controller level, `@Roles(UserRole.ADMIN)` / `@Roles(UserRole.ADMIN, UserRole.TEACHER)` per route.
- Cross-module `TypeOrmModule.forFeature([...])` entity imports are allowed and already used in this codebase (`category.module.ts` imports `MerchantEntity`) — use this instead of inventing a service layer between modules. The only allowed cross-module *class* import for event-driven async communication is the domain event class itself (existing rule in `attendance-api/CLAUDE.md`).
- Backend modules register every command/query handler explicitly in `providers` (no auto-discovery), matching every existing module.
- Frontend feature slices under `src/features/<domain>/` must not import each other, except two exceptions this plan adds: `students → classrooms` and `attendance → classrooms` (both need the classroom picker / name lookup) — document these in `attendance-admin/CLAUDE.md` alongside the existing documented exceptions.
- Frontend action files map the API's `snake_case` response to `camelCase` domain types via a small `toX()` mapper function, same pattern as the (removed) `orders`/`items` slices used.
- Every frontend form uses React Hook Form + Zod (`schemas/<form>.schema.ts`, `zodResolver`).
- Quality gate before each commit: backend `npm run lint && npx tsc --noEmit && npm test`; frontend `npm run lint && npx tsc --noEmit`.

---

## Task 1: Classroom module (backend)

**Files:**
- Create: `attendance-api/src/classroom/infrastructure/entities/classroom.entity.ts`
- Create: `attendance-api/src/classroom/api/dto/create-classroom.dto.ts`
- Create: `attendance-api/src/classroom/api/dto/update-classroom.dto.ts`
- Create: `attendance-api/src/classroom/application/commands/create-classroom.command.ts`
- Create: `attendance-api/src/classroom/application/commands/create-classroom.handler.ts`
- Create: `attendance-api/src/classroom/application/commands/update-classroom.command.ts`
- Create: `attendance-api/src/classroom/application/commands/update-classroom.handler.ts`
- Create: `attendance-api/src/classroom/application/commands/delete-classroom.command.ts`
- Create: `attendance-api/src/classroom/application/commands/delete-classroom.handler.ts`
- Create: `attendance-api/src/classroom/application/queries/get-classrooms.query.ts`
- Create: `attendance-api/src/classroom/application/queries/get-classrooms.handler.ts`
- Create: `attendance-api/src/classroom/application/queries/get-classroom.query.ts`
- Create: `attendance-api/src/classroom/application/queries/get-classroom.handler.ts`
- Create: `attendance-api/src/classroom/api/controllers/classrooms.controller.ts`
- Create: `attendance-api/src/classroom/classroom.module.ts`
- Modify: `attendance-api/src/app.module.ts` (add `ClassroomModule` to imports)
- Test: `attendance-api/test/unit/classroom/classroom-commands.handler.spec.ts`
- Test: `attendance-api/test/unit/classroom/classroom-queries.handler.spec.ts`

**Interfaces:**
- Produces: `ClassroomEntity { id: string; name: string; gradeLabel: string | null; teacherId: string | null; createdAt: Date; updatedAt: Date }`, routes `GET/POST /classrooms`, `GET/PATCH/DELETE /classrooms/:id`.
- Consumes: `JwtAuthGuard`, `RolesGuard`, `Roles` decorator, `UserRole` from `src/shared/`.

- [ ] **Step 1: Entity**

```ts
// attendance-api/src/classroom/infrastructure/entities/classroom.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('classrooms')
export class ClassroomEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  gradeLabel: string | null;

  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: DTOs**

```ts
// attendance-api/src/classroom/api/dto/create-classroom.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateClassroomDto {
  @ApiProperty({ example: 'Grade 3A' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'Grade 3', required: false })
  @IsOptional()
  @IsString()
  grade_label?: string;

  @ApiProperty({ required: false, description: 'Teacher user id' })
  @IsOptional()
  @IsUUID()
  teacher_id?: string;
}
```

```ts
// attendance-api/src/classroom/api/dto/update-classroom.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateClassroomDto } from './create-classroom.dto';

export class UpdateClassroomDto extends PartialType(CreateClassroomDto) {}
```

- [ ] **Step 3: Commands**

```ts
// attendance-api/src/classroom/application/commands/create-classroom.command.ts
export class CreateClassroomCommand {
  constructor(
    public readonly name: string,
    public readonly gradeLabel: string | null,
    public readonly teacherId: string | null,
  ) {}
}
```

```ts
// attendance-api/src/classroom/application/commands/create-classroom.handler.ts
import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { CreateClassroomCommand } from './create-classroom.command';

@Injectable()
@CommandHandler(CreateClassroomCommand)
export class CreateClassroomHandler
  implements ICommandHandler<CreateClassroomCommand, ClassroomEntity>
{
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: CreateClassroomCommand): Promise<ClassroomEntity> {
    const classroom = this.classroomRepository.create({
      id: crypto.randomUUID(),
      name: command.name,
      gradeLabel: command.gradeLabel,
      teacherId: command.teacherId,
    });
    return this.classroomRepository.save(classroom);
  }
}
```

```ts
// attendance-api/src/classroom/application/commands/update-classroom.command.ts
export class UpdateClassroomCommand {
  constructor(
    public readonly id: string,
    public readonly name?: string,
    public readonly gradeLabel?: string | null,
    public readonly teacherId?: string | null,
  ) {}
}
```

```ts
// attendance-api/src/classroom/application/commands/update-classroom.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { UpdateClassroomCommand } from './update-classroom.command';

@Injectable()
@CommandHandler(UpdateClassroomCommand)
export class UpdateClassroomHandler
  implements ICommandHandler<UpdateClassroomCommand, ClassroomEntity>
{
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: UpdateClassroomCommand): Promise<ClassroomEntity> {
    const classroom = await this.classroomRepository.findOneBy({ id: command.id });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    if (command.name !== undefined) classroom.name = command.name;
    if (command.gradeLabel !== undefined) classroom.gradeLabel = command.gradeLabel;
    if (command.teacherId !== undefined) classroom.teacherId = command.teacherId;
    return this.classroomRepository.save(classroom);
  }
}
```

```ts
// attendance-api/src/classroom/application/commands/delete-classroom.command.ts
export class DeleteClassroomCommand {
  constructor(public readonly id: string) {}
}
```

```ts
// attendance-api/src/classroom/application/commands/delete-classroom.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { DeleteClassroomCommand } from './delete-classroom.command';

@Injectable()
@CommandHandler(DeleteClassroomCommand)
export class DeleteClassroomHandler implements ICommandHandler<DeleteClassroomCommand, void> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: DeleteClassroomCommand): Promise<void> {
    const result = await this.classroomRepository.delete({ id: command.id });
    if (!result.affected) {
      throw new NotFoundException('Classroom not found');
    }
  }
}
```

- [ ] **Step 4: Queries**

```ts
// attendance-api/src/classroom/application/queries/get-classrooms.query.ts
export class GetClassroomsQuery {}
```

```ts
// attendance-api/src/classroom/application/queries/get-classrooms.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { GetClassroomsQuery } from './get-classrooms.query';

@Injectable()
@QueryHandler(GetClassroomsQuery)
export class GetClassroomsHandler implements IQueryHandler<GetClassroomsQuery, ClassroomEntity[]> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  execute(): Promise<ClassroomEntity[]> {
    return this.classroomRepository.find({ order: { name: 'ASC' } });
  }
}
```

```ts
// attendance-api/src/classroom/application/queries/get-classroom.query.ts
export class GetClassroomQuery {
  constructor(public readonly id: string) {}
}
```

```ts
// attendance-api/src/classroom/application/queries/get-classroom.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../../infrastructure/entities/classroom.entity';
import { GetClassroomQuery } from './get-classroom.query';

@Injectable()
@QueryHandler(GetClassroomQuery)
export class GetClassroomHandler implements IQueryHandler<GetClassroomQuery, ClassroomEntity> {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(query: GetClassroomQuery): Promise<ClassroomEntity> {
    const classroom = await this.classroomRepository.findOneBy({ id: query.id });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    return classroom;
  }
}
```

- [ ] **Step 5: Controller**

```ts
// attendance-api/src/classroom/api/controllers/classrooms.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { CreateClassroomDto } from '../dto/create-classroom.dto';
import { UpdateClassroomDto } from '../dto/update-classroom.dto';
import { CreateClassroomCommand } from '../../application/commands/create-classroom.command';
import { UpdateClassroomCommand } from '../../application/commands/update-classroom.command';
import { DeleteClassroomCommand } from '../../application/commands/delete-classroom.command';
import { GetClassroomsQuery } from '../../application/queries/get-classrooms.query';
import { GetClassroomQuery } from '../../application/queries/get-classroom.query';

@ApiTags('classrooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('classrooms')
export class ClassroomsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List all classrooms' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get()
  list() {
    return this.queryBus.execute(new GetClassroomsQuery());
  }

  @ApiOperation({ summary: 'Get one classroom' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.queryBus.execute(new GetClassroomQuery(id));
  }

  @ApiOperation({ summary: 'Create a classroom (admin only)' })
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateClassroomDto) {
    return this.commandBus.execute(
      new CreateClassroomCommand(dto.name, dto.grade_label ?? null, dto.teacher_id ?? null),
    );
  }

  @ApiOperation({ summary: 'Update a classroom (admin only)' })
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClassroomDto) {
    return this.commandBus.execute(
      new UpdateClassroomCommand(id, dto.name, dto.grade_label, dto.teacher_id),
    );
  }

  @ApiOperation({ summary: 'Delete a classroom (admin only)' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteClassroomCommand(id));
  }
}
```

- [ ] **Step 6: Module**

```ts
// attendance-api/src/classroom/classroom.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomEntity } from './infrastructure/entities/classroom.entity';
import { ClassroomsController } from './api/controllers/classrooms.controller';
import { CreateClassroomHandler } from './application/commands/create-classroom.handler';
import { UpdateClassroomHandler } from './application/commands/update-classroom.handler';
import { DeleteClassroomHandler } from './application/commands/delete-classroom.handler';
import { GetClassroomsHandler } from './application/queries/get-classrooms.handler';
import { GetClassroomHandler } from './application/queries/get-classroom.handler';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([ClassroomEntity]), JwtModule.register({})],
  controllers: [ClassroomsController],
  providers: [
    CreateClassroomHandler,
    UpdateClassroomHandler,
    DeleteClassroomHandler,
    GetClassroomsHandler,
    GetClassroomHandler,
  ],
})
export class ClassroomModule {}
```

Then add `ClassroomModule` to `attendance-api/src/app.module.ts`'s `imports` array (import statement + array entry).

- [ ] **Step 7: Tests**

```ts
// attendance-api/test/unit/classroom/classroom-commands.handler.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateClassroomHandler } from '../../../src/classroom/application/commands/create-classroom.handler';
import { CreateClassroomCommand } from '../../../src/classroom/application/commands/create-classroom.command';
import { UpdateClassroomHandler } from '../../../src/classroom/application/commands/update-classroom.handler';
import { UpdateClassroomCommand } from '../../../src/classroom/application/commands/update-classroom.command';
import { DeleteClassroomHandler } from '../../../src/classroom/application/commands/delete-classroom.handler';
import { DeleteClassroomCommand } from '../../../src/classroom/application/commands/delete-classroom.command';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

describe('Classroom command handlers', () => {
  let createHandler: CreateClassroomHandler;
  let updateHandler: UpdateClassroomHandler;
  let deleteHandler: DeleteClassroomHandler;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v: Partial<ClassroomEntity>) => v as ClassroomEntity),
      save: jest.fn(async (v: ClassroomEntity) => v),
      findOneBy: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreateClassroomHandler,
        UpdateClassroomHandler,
        DeleteClassroomHandler,
        { provide: getRepositoryToken(ClassroomEntity), useValue: repo },
      ],
    }).compile();

    createHandler = module.get(CreateClassroomHandler);
    updateHandler = module.get(UpdateClassroomHandler);
    deleteHandler = module.get(DeleteClassroomHandler);
  });

  it('creates a classroom', async () => {
    const result = await createHandler.execute(
      new CreateClassroomCommand('Grade 3A', 'Grade 3', null),
    );
    expect(result.name).toBe('Grade 3A');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('updates an existing classroom', async () => {
    repo.findOneBy.mockResolvedValue({ id: '1', name: 'Old', gradeLabel: null, teacherId: null });
    const result = await updateHandler.execute(new UpdateClassroomCommand('1', 'New Name'));
    expect(result.name).toBe('New Name');
  });

  it('throws NotFoundException updating a missing classroom', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(
      updateHandler.execute(new UpdateClassroomCommand('missing', 'X')),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing classroom', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(
      deleteHandler.execute(new DeleteClassroomCommand('1')),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundException deleting a missing classroom', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(
      deleteHandler.execute(new DeleteClassroomCommand('missing')),
    ).rejects.toThrow(NotFoundException);
  });
});
```

```ts
// attendance-api/test/unit/classroom/classroom-queries.handler.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetClassroomsHandler } from '../../../src/classroom/application/queries/get-classrooms.handler';
import { GetClassroomsQuery } from '../../../src/classroom/application/queries/get-classrooms.query';
import { GetClassroomHandler } from '../../../src/classroom/application/queries/get-classroom.handler';
import { GetClassroomQuery } from '../../../src/classroom/application/queries/get-classroom.query';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

describe('Classroom query handlers', () => {
  let listHandler: GetClassroomsHandler;
  let getHandler: GetClassroomHandler;
  let repo: { find: jest.Mock; findOneBy: jest.Mock };

  beforeEach(async () => {
    repo = { find: jest.fn(), findOneBy: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GetClassroomsHandler,
        GetClassroomHandler,
        { provide: getRepositoryToken(ClassroomEntity), useValue: repo },
      ],
    }).compile();
    listHandler = module.get(GetClassroomsHandler);
    getHandler = module.get(GetClassroomHandler);
  });

  it('lists classrooms ordered by name', async () => {
    repo.find.mockResolvedValue([{ id: '1', name: 'A' }]);
    const result = await listHandler.execute(new GetClassroomsQuery());
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
  });

  it('returns a single classroom', async () => {
    repo.findOneBy.mockResolvedValue({ id: '1', name: 'A' });
    const result = await getHandler.execute(new GetClassroomQuery('1'));
    expect(result.id).toBe('1');
  });

  it('throws NotFoundException for a missing classroom', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(getHandler.execute(new GetClassroomQuery('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 8: Verify and commit**

Run: `cd attendance-api && npm run lint && npx tsc --noEmit && npm test -- --testPathPattern=classroom`
Expected: PASS, 0 lint errors, 0 type errors.

```bash
git add src/classroom src/app.module.ts test/unit/classroom
git commit -m "feat: classroom CRUD module"
```

---

## Task 2: Student module (backend)

Same shape as Task 1, with a `classroomId` FK and a `status` enum. **Files:**
- Create: `attendance-api/src/student/infrastructure/entities/student.entity.ts`
- Create: `attendance-api/src/student/api/dto/create-student.dto.ts`
- Create: `attendance-api/src/student/api/dto/update-student.dto.ts`
- Create: `attendance-api/src/student/application/commands/{create,update,delete}-student.{command,handler}.ts` (6 files)
- Create: `attendance-api/src/student/application/queries/{get-students,get-student}.{query,handler}.ts` (4 files)
- Create: `attendance-api/src/student/api/controllers/students.controller.ts`
- Create: `attendance-api/src/student/student.module.ts`
- Modify: `attendance-api/src/app.module.ts` (add `StudentModule`)
- Test: `attendance-api/test/unit/student/student-commands.handler.spec.ts`
- Test: `attendance-api/test/unit/student/student-queries.handler.spec.ts`

**Interfaces:**
- Produces: `StudentEntity { id, name, classroomId, status: StudentStatus, createdAt, updatedAt }`, `StudentStatus.ACTIVE`/`StudentStatus.INACTIVE`, routes `GET/POST /students`, `GET/PATCH/DELETE /students/:id`, `GET /students?classroom_id=`.
- Consumes: same shared guards/decorators as Task 1.

- [ ] **Step 1: Entity**

```ts
// attendance-api/src/student/infrastructure/entities/student.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum StudentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('students')
export class StudentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'uuid' })
  classroomId: string;

  @Column({ type: 'enum', enum: StudentStatus, default: StudentStatus.ACTIVE })
  status: StudentStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: DTOs**

```ts
// attendance-api/src/student/api/dto/create-student.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'Sokha' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty()
  @IsUUID()
  classroom_id: string;
}
```

```ts
// attendance-api/src/student/api/dto/update-student.dto.ts
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';
import { StudentStatus } from '../../infrastructure/entities/student.entity';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @ApiProperty({ enum: StudentStatus, required: false })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
```

- [ ] **Step 3: Commands**

```ts
// attendance-api/src/student/application/commands/create-student.command.ts
export class CreateStudentCommand {
  constructor(
    public readonly name: string,
    public readonly classroomId: string,
  ) {}
}
```

```ts
// attendance-api/src/student/application/commands/create-student.handler.ts
import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity, StudentStatus } from '../../infrastructure/entities/student.entity';
import { CreateStudentCommand } from './create-student.command';

@Injectable()
@CommandHandler(CreateStudentCommand)
export class CreateStudentHandler implements ICommandHandler<CreateStudentCommand, StudentEntity> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: CreateStudentCommand): Promise<StudentEntity> {
    const student = this.studentRepository.create({
      id: crypto.randomUUID(),
      name: command.name,
      classroomId: command.classroomId,
      status: StudentStatus.ACTIVE,
    });
    return this.studentRepository.save(student);
  }
}
```

```ts
// attendance-api/src/student/application/commands/update-student.command.ts
import type { StudentStatus } from '../../infrastructure/entities/student.entity';

export class UpdateStudentCommand {
  constructor(
    public readonly id: string,
    public readonly name?: string,
    public readonly classroomId?: string,
    public readonly status?: StudentStatus,
  ) {}
}
```

```ts
// attendance-api/src/student/application/commands/update-student.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { UpdateStudentCommand } from './update-student.command';

@Injectable()
@CommandHandler(UpdateStudentCommand)
export class UpdateStudentHandler implements ICommandHandler<UpdateStudentCommand, StudentEntity> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: UpdateStudentCommand): Promise<StudentEntity> {
    const student = await this.studentRepository.findOneBy({ id: command.id });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (command.name !== undefined) student.name = command.name;
    if (command.classroomId !== undefined) student.classroomId = command.classroomId;
    if (command.status !== undefined) student.status = command.status;
    return this.studentRepository.save(student);
  }
}
```

```ts
// attendance-api/src/student/application/commands/delete-student.command.ts
export class DeleteStudentCommand {
  constructor(public readonly id: string) {}
}
```

```ts
// attendance-api/src/student/application/commands/delete-student.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { DeleteStudentCommand } from './delete-student.command';

@Injectable()
@CommandHandler(DeleteStudentCommand)
export class DeleteStudentHandler implements ICommandHandler<DeleteStudentCommand, void> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(command: DeleteStudentCommand): Promise<void> {
    const result = await this.studentRepository.delete({ id: command.id });
    if (!result.affected) {
      throw new NotFoundException('Student not found');
    }
  }
}
```

- [ ] **Step 4: Queries**

```ts
// attendance-api/src/student/application/queries/get-students.query.ts
export class GetStudentsQuery {
  constructor(public readonly classroomId?: string) {}
}
```

```ts
// attendance-api/src/student/application/queries/get-students.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { GetStudentsQuery } from './get-students.query';

@Injectable()
@QueryHandler(GetStudentsQuery)
export class GetStudentsHandler implements IQueryHandler<GetStudentsQuery, StudentEntity[]> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  execute(query: GetStudentsQuery): Promise<StudentEntity[]> {
    return this.studentRepository.find({
      where: query.classroomId ? { classroomId: query.classroomId } : {},
      order: { name: 'ASC' },
    });
  }
}
```

```ts
// attendance-api/src/student/application/queries/get-student.query.ts
export class GetStudentQuery {
  constructor(public readonly id: string) {}
}
```

```ts
// attendance-api/src/student/application/queries/get-student.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../infrastructure/entities/student.entity';
import { GetStudentQuery } from './get-student.query';

@Injectable()
@QueryHandler(GetStudentQuery)
export class GetStudentHandler implements IQueryHandler<GetStudentQuery, StudentEntity> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
  ) {}

  async execute(query: GetStudentQuery): Promise<StudentEntity> {
    const student = await this.studentRepository.findOneBy({ id: query.id });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }
}
```

- [ ] **Step 5: Controller**

```ts
// attendance-api/src/student/api/controllers/students.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { CreateStudentDto } from '../dto/create-student.dto';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { CreateStudentCommand } from '../../application/commands/create-student.command';
import { UpdateStudentCommand } from '../../application/commands/update-student.command';
import { DeleteStudentCommand } from '../../application/commands/delete-student.command';
import { GetStudentsQuery } from '../../application/queries/get-students.query';
import { GetStudentQuery } from '../../application/queries/get-student.query';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List students, optionally filtered by classroom' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get()
  list(@Query('classroom_id') classroomId?: string) {
    return this.queryBus.execute(new GetStudentsQuery(classroomId));
  }

  @ApiOperation({ summary: 'Get one student' })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.queryBus.execute(new GetStudentQuery(id));
  }

  @ApiOperation({ summary: 'Add a student (admin only)' })
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateStudentDto) {
    return this.commandBus.execute(new CreateStudentCommand(dto.name, dto.classroom_id));
  }

  @ApiOperation({ summary: 'Edit a student (admin only)' })
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.commandBus.execute(
      new UpdateStudentCommand(id, dto.name, dto.classroom_id, dto.status),
    );
  }

  @ApiOperation({ summary: 'Remove a student (admin only)' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteStudentCommand(id));
  }
}
```

- [ ] **Step 6: Module**

```ts
// attendance-api/src/student/student.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from './infrastructure/entities/student.entity';
import { StudentsController } from './api/controllers/students.controller';
import { CreateStudentHandler } from './application/commands/create-student.handler';
import { UpdateStudentHandler } from './application/commands/update-student.handler';
import { DeleteStudentHandler } from './application/commands/delete-student.handler';
import { GetStudentsHandler } from './application/queries/get-students.handler';
import { GetStudentHandler } from './application/queries/get-student.handler';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([StudentEntity]), JwtModule.register({})],
  controllers: [StudentsController],
  providers: [
    CreateStudentHandler,
    UpdateStudentHandler,
    DeleteStudentHandler,
    GetStudentsHandler,
    GetStudentHandler,
  ],
})
export class StudentModule {}
```

Then add `StudentModule` to `attendance-api/src/app.module.ts`.

- [ ] **Step 7: Tests**

Mirror Task 1's two spec files exactly (same structure), swapping in `Student*` handlers/commands/queries and `StudentEntity`. Additionally add one query test asserting the `classroom_id` filter:

```ts
// in student-queries.handler.spec.ts, additional test case
it('filters by classroom_id when provided', async () => {
  repo.find.mockResolvedValue([]);
  await listHandler.execute(new GetStudentsQuery('classroom-1'));
  expect(repo.find).toHaveBeenCalledWith({
    where: { classroomId: 'classroom-1' },
    order: { name: 'ASC' },
  });
});
```

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npx tsc --noEmit && npm test -- --testPathPattern=student`
Expected: PASS.

```bash
git add src/student src/app.module.ts test/unit/student
git commit -m "feat: student CRUD module"
```

---

## Task 3: Parent-link module — admin-facing linking codes (backend)

Depends on Task 2 (`StudentEntity`). **Files:**
- Create: `attendance-api/src/parent-link/infrastructure/entities/linking-code.entity.ts`
- Create: `attendance-api/src/parent-link/infrastructure/entities/parent-link.entity.ts`
- Create: `attendance-api/src/parent-link/api/dto/generate-linking-code.dto.ts`
- Create: `attendance-api/src/parent-link/application/commands/generate-linking-code.command.ts`
- Create: `attendance-api/src/parent-link/application/commands/generate-linking-code.handler.ts`
- Create: `attendance-api/src/parent-link/application/queries/get-linking-status.query.ts`
- Create: `attendance-api/src/parent-link/application/queries/get-linking-status.handler.ts`
- Create: `attendance-api/src/parent-link/api/controllers/parent-links.controller.ts`
- Create: `attendance-api/src/parent-link/parent-link.module.ts`
- Modify: `attendance-api/src/app.module.ts` (add `ParentLinkModule`)
- Test: `attendance-api/test/unit/parent-link/generate-linking-code.handler.spec.ts`

**Interfaces:**
- Produces: `LinkingCodeEntity { id, studentId, code, expiresAt, usedAt, createdAt }`, `ParentLinkEntity { id, studentId, telegramChatId, linkedAt }`, routes `GET /parent-links/status`, `POST /parent-links/codes`. These two entities are consumed directly (via cross-module `forFeature`) by Task 5 and Task 6 — do not add a service layer for them.

- [ ] **Step 1: Entities**

```ts
// attendance-api/src/parent-link/infrastructure/entities/linking-code.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('linking_codes')
export class LinkingCodeEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

```ts
// attendance-api/src/parent-link/infrastructure/entities/parent-link.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('parent_links')
export class ParentLinkEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column()
  telegramChatId: string;

  @CreateDateColumn()
  linkedAt: Date;
}
```

- [ ] **Step 2: Generate-code command**

```ts
// attendance-api/src/parent-link/application/commands/generate-linking-code.command.ts
export class GenerateLinkingCodeCommand {
  constructor(public readonly studentId: string) {}
}
```

```ts
// attendance-api/src/parent-link/application/commands/generate-linking-code.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../infrastructure/entities/linking-code.entity';
import { GenerateLinkingCodeCommand } from './generate-linking-code.command';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const CODE_LENGTH = 8;
const EXPIRY_DAYS = 7;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

@Injectable()
@CommandHandler(GenerateLinkingCodeCommand)
export class GenerateLinkingCodeHandler
  implements ICommandHandler<GenerateLinkingCodeCommand, LinkingCodeEntity>
{
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(LinkingCodeEntity)
    private readonly linkingCodeRepository: Repository<LinkingCodeEntity>,
  ) {}

  async execute(command: GenerateLinkingCodeCommand): Promise<LinkingCodeEntity> {
    const student = await this.studentRepository.findOneBy({ id: command.studentId });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const linkingCode = this.linkingCodeRepository.create({
      id: crypto.randomUUID(),
      studentId: command.studentId,
      code: generateCode(),
      expiresAt,
      usedAt: null,
    });
    return this.linkingCodeRepository.save(linkingCode);
  }
}
```

- [ ] **Step 3: Linking-status query (the admin "unlinked" follow-up list)**

```ts
// attendance-api/src/parent-link/application/queries/get-linking-status.query.ts
export class GetLinkingStatusQuery {}
```

```ts
// attendance-api/src/parent-link/application/queries/get-linking-status.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../infrastructure/entities/parent-link.entity';
import { GetLinkingStatusQuery } from './get-linking-status.query';

export interface LinkingStatusEntry {
  studentId: string;
  studentName: string;
  linked: boolean;
  activeCode: string | null;
}

@Injectable()
@QueryHandler(GetLinkingStatusQuery)
export class GetLinkingStatusHandler
  implements IQueryHandler<GetLinkingStatusQuery, LinkingStatusEntry[]>
{
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(LinkingCodeEntity)
    private readonly linkingCodeRepository: Repository<LinkingCodeEntity>,
  ) {}

  async execute(): Promise<LinkingStatusEntry[]> {
    const [students, links, codes] = await Promise.all([
      this.studentRepository.find({ order: { name: 'ASC' } }),
      this.parentLinkRepository.find(),
      this.linkingCodeRepository.find(),
    ]);

    const linkedStudentIds = new Set(links.map((l) => l.studentId));
    const now = Date.now();
    const activeCodeByStudent = new Map<string, string>();
    for (const c of codes) {
      if (c.usedAt === null && c.expiresAt.getTime() > now && !activeCodeByStudent.has(c.studentId)) {
        activeCodeByStudent.set(c.studentId, c.code);
      }
    }

    return students.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      linked: linkedStudentIds.has(s.id),
      activeCode: activeCodeByStudent.get(s.id) ?? null,
    }));
  }
}
```

- [ ] **Step 4: DTO + Controller**

```ts
// attendance-api/src/parent-link/api/dto/generate-linking-code.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GenerateLinkingCodeDto {
  @ApiProperty()
  @IsUUID()
  student_id: string;
}
```

```ts
// attendance-api/src/parent-link/api/controllers/parent-links.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { GenerateLinkingCodeDto } from '../dto/generate-linking-code.dto';
import { GenerateLinkingCodeCommand } from '../../application/commands/generate-linking-code.command';
import { GetLinkingStatusQuery } from '../../application/queries/get-linking-status.query';

@ApiTags('parent-links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('parent-links')
export class ParentLinksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: 'List every student with linked/unlinked status (follow-up list)' })
  @Get('status')
  status() {
    return this.queryBus.execute(new GetLinkingStatusQuery());
  }

  @ApiOperation({ summary: 'Generate a new linking code for a student, printable/shareable to a parent' })
  @Post('codes')
  generateCode(@Body() dto: GenerateLinkingCodeDto) {
    return this.commandBus.execute(new GenerateLinkingCodeCommand(dto.student_id));
  }
}
```

- [ ] **Step 5: Module**

```ts
// attendance-api/src/parent-link/parent-link.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from './infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from './infrastructure/entities/parent-link.entity';
import { ParentLinksController } from './api/controllers/parent-links.controller';
import { GenerateLinkingCodeHandler } from './application/commands/generate-linking-code.handler';
import { GetLinkingStatusHandler } from './application/queries/get-linking-status.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([StudentEntity, LinkingCodeEntity, ParentLinkEntity]),
    JwtModule.register({}),
  ],
  controllers: [ParentLinksController],
  providers: [GenerateLinkingCodeHandler, GetLinkingStatusHandler],
})
export class ParentLinkModule {}
```

Then add `ParentLinkModule` to `attendance-api/src/app.module.ts`.

- [ ] **Step 6: Test**

```ts
// attendance-api/test/unit/parent-link/generate-linking-code.handler.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GenerateLinkingCodeHandler } from '../../../src/parent-link/application/commands/generate-linking-code.handler';
import { GenerateLinkingCodeCommand } from '../../../src/parent-link/application/commands/generate-linking-code.command';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../../src/parent-link/infrastructure/entities/linking-code.entity';

describe('GenerateLinkingCodeHandler', () => {
  let handler: GenerateLinkingCodeHandler;
  let studentRepo: { findOneBy: jest.Mock };
  let linkingCodeRepo: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    studentRepo = { findOneBy: jest.fn() };
    linkingCodeRepo = {
      create: jest.fn((v: Partial<LinkingCodeEntity>) => v as LinkingCodeEntity),
      save: jest.fn(async (v: LinkingCodeEntity) => v),
    };

    const module = await Test.createTestingModule({
      providers: [
        GenerateLinkingCodeHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: getRepositoryToken(LinkingCodeEntity), useValue: linkingCodeRepo },
      ],
    }).compile();

    handler = module.get(GenerateLinkingCodeHandler);
  });

  it('throws NotFoundException when the student does not exist', async () => {
    studentRepo.findOneBy.mockResolvedValue(null);
    await expect(
      handler.execute(new GenerateLinkingCodeCommand('missing')),
    ).rejects.toThrow(NotFoundException);
  });

  it('generates an 8-character code expiring 7 days out', async () => {
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });
    const before = Date.now();

    const result = await handler.execute(new GenerateLinkingCodeCommand('student-1'));

    expect(result.studentId).toBe('student-1');
    expect(result.code).toHaveLength(8);
    expect(result.usedAt).toBeNull();
    const expiresInMs = result.expiresAt.getTime() - before;
    expect(expiresInMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(expiresInMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000);
  });
});
```

- [ ] **Step 7: Verify and commit**

Run: `npm run lint && npx tsc --noEmit && npm test -- --testPathPattern=parent-link`
Expected: PASS.

```bash
git add src/parent-link src/app.module.ts test/unit/parent-link
git commit -m "feat: parent-link module (linking codes + status)"
```

---

## Task 4: Attendance module — marking, edit audit log, roster (backend)

Depends on Task 2 (`StudentEntity`). This is the module with real business logic: re-marking a student on the same day is an **edit**, and edits get an audit-log row. **Files:**
- Create: `attendance-api/src/attendance/domain/events/attendance-marked.event.ts`
- Create: `attendance-api/src/attendance/infrastructure/entities/attendance-record.entity.ts`
- Create: `attendance-api/src/attendance/infrastructure/entities/attendance-audit-log.entity.ts`
- Create: `attendance-api/src/attendance/application/commands/mark-attendance.command.ts`
- Create: `attendance-api/src/attendance/application/commands/mark-attendance.handler.ts`
- Create: `attendance-api/src/attendance/application/commands/bulk-mark-attendance.command.ts`
- Create: `attendance-api/src/attendance/application/commands/bulk-mark-attendance.handler.ts`
- Create: `attendance-api/src/attendance/application/queries/get-roster.query.ts`
- Create: `attendance-api/src/attendance/application/queries/get-roster.handler.ts`
- Create: `attendance-api/src/attendance/api/dto/mark-attendance.dto.ts`
- Create: `attendance-api/src/attendance/api/dto/bulk-mark-attendance.dto.ts`
- Create: `attendance-api/src/attendance/api/controllers/attendance.controller.ts`
- Create: `attendance-api/src/attendance/attendance.module.ts`
- Modify: `attendance-api/src/app.module.ts` (add `AttendanceModule`)
- Test: `attendance-api/test/unit/attendance/mark-attendance.handler.spec.ts`
- Test: `attendance-api/test/unit/attendance/bulk-mark-attendance.handler.spec.ts`
- Test: `attendance-api/test/unit/attendance/get-roster.handler.spec.ts`

**Interfaces:**
- Produces: `AttendanceStatus.PRESENT|ABSENT|LATE`, `AttendanceRecordEntity`, `AttendanceAuditLogEntity`, `AttendanceMarkedEvent(studentId, classroomId, date, status, note)` (consumed by Task 6), routes `GET /attendance/roster?classroom_id=&date=`, `POST /attendance/mark`, `POST /attendance/bulk-mark`.
- Design note: there is deliberately **no** separate `UpdateAttendanceCommand` — re-marking a student on the same `date` via `MarkAttendanceCommand` IS the edit flow (upsert semantics), which is what naturally produces the audit trail. `BulkMarkAttendanceCommand` ("mark all present, then adjust exceptions") reuses `MarkAttendanceCommand` by dispatching it once per student through the injected `CommandBus`, rather than duplicating the upsert logic.

- [ ] **Step 1: Domain event + entities**

```ts
// attendance-api/src/attendance/domain/events/attendance-marked.event.ts
export class AttendanceMarkedEvent {
  constructor(
    public readonly studentId: string,
    public readonly classroomId: string,
    public readonly date: string,
    public readonly status: 'present' | 'absent' | 'late',
    public readonly note: string | null,
  ) {}
}
```

```ts
// attendance-api/src/attendance/infrastructure/entities/attendance-record.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
}

@Entity('attendance_records')
@Index(['studentId', 'date'], { unique: true })
export class AttendanceRecordEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'uuid' })
  classroomId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status: AttendanceStatus;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'uuid' })
  markedByUserId: string;

  @CreateDateColumn()
  markedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

```ts
// attendance-api/src/attendance/infrastructure/entities/attendance-audit-log.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { AttendanceStatus } from './attendance-record.entity';

@Entity('attendance_audit_logs')
export class AttendanceAuditLogEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  attendanceRecordId: string;

  @Column({ type: 'uuid' })
  changedByUserId: string;

  @Column({ type: 'enum', enum: AttendanceStatus })
  previousStatus: AttendanceStatus;

  @Column({ type: 'enum', enum: AttendanceStatus })
  newStatus: AttendanceStatus;

  @CreateDateColumn()
  changedAt: Date;
}
```

- [ ] **Step 2: MarkAttendanceCommand (upsert + audit-on-edit + event)**

```ts
// attendance-api/src/attendance/application/commands/mark-attendance.command.ts
import type { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class MarkAttendanceCommand {
  constructor(
    public readonly studentId: string,
    public readonly classroomId: string,
    public readonly date: string,
    public readonly status: AttendanceStatus,
    public readonly note: string | null,
    public readonly markedByUserId: string,
  ) {}
}
```

```ts
// attendance-api/src/attendance/application/commands/mark-attendance.handler.ts
import { Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from '../../infrastructure/entities/attendance-audit-log.entity';
import { AttendanceMarkedEvent } from '../../domain/events/attendance-marked.event';
import { MarkAttendanceCommand } from './mark-attendance.command';

@Injectable()
@CommandHandler(MarkAttendanceCommand)
export class MarkAttendanceHandler
  implements ICommandHandler<MarkAttendanceCommand, AttendanceRecordEntity>
{
  constructor(
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
    @InjectRepository(AttendanceAuditLogEntity)
    private readonly auditRepository: Repository<AttendanceAuditLogEntity>,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: MarkAttendanceCommand): Promise<AttendanceRecordEntity> {
    const { studentId, classroomId, date, status, note, markedByUserId } = command;

    const existing = await this.recordRepository.findOneBy({ studentId, date });

    let record: AttendanceRecordEntity;
    if (existing) {
      // Re-marking the same student on the same day is an edit — keep an audit
      // trail of who changed it and what it changed from/to.
      await this.auditRepository.save({
        id: crypto.randomUUID(),
        attendanceRecordId: existing.id,
        changedByUserId: markedByUserId,
        previousStatus: existing.status,
        newStatus: status,
      });
      existing.status = status;
      existing.note = note;
      existing.markedByUserId = markedByUserId;
      record = await this.recordRepository.save(existing);
    } else {
      record = await this.recordRepository.save(
        this.recordRepository.create({
          id: crypto.randomUUID(),
          studentId,
          classroomId,
          date,
          status,
          note,
          markedByUserId,
        }),
      );
    }

    this.eventBus.publish(new AttendanceMarkedEvent(studentId, classroomId, date, status, note));

    return record;
  }
}
```

- [ ] **Step 3: BulkMarkAttendanceCommand (reuses MarkAttendanceCommand via CommandBus)**

```ts
// attendance-api/src/attendance/application/commands/bulk-mark-attendance.command.ts
import type { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class BulkMarkAttendanceCommand {
  constructor(
    public readonly studentIds: string[],
    public readonly classroomId: string,
    public readonly date: string,
    public readonly status: AttendanceStatus,
    public readonly markedByUserId: string,
  ) {}
}
```

```ts
// attendance-api/src/attendance/application/commands/bulk-mark-attendance.handler.ts
import { Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { MarkAttendanceCommand } from './mark-attendance.command';
import { BulkMarkAttendanceCommand } from './bulk-mark-attendance.command';

@Injectable()
@CommandHandler(BulkMarkAttendanceCommand)
export class BulkMarkAttendanceHandler
  implements ICommandHandler<BulkMarkAttendanceCommand, AttendanceRecordEntity[]>
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: BulkMarkAttendanceCommand): Promise<AttendanceRecordEntity[]> {
    const { studentIds, classroomId, date, status, markedByUserId } = command;
    const results: AttendanceRecordEntity[] = [];
    for (const studentId of studentIds) {
      const record = await this.commandBus.execute<MarkAttendanceCommand, AttendanceRecordEntity>(
        new MarkAttendanceCommand(studentId, classroomId, date, status, null, markedByUserId),
      );
      results.push(record);
    }
    return results;
  }
}
```

- [ ] **Step 4: GetRosterQuery (joins students + today's records in memory)**

```ts
// attendance-api/src/attendance/application/queries/get-roster.query.ts
export class GetRosterQuery {
  constructor(
    public readonly classroomId: string,
    public readonly date: string,
  ) {}
}
```

```ts
// attendance-api/src/attendance/application/queries/get-roster.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../infrastructure/entities/attendance-record.entity';
import { GetRosterQuery } from './get-roster.query';

export interface RosterEntry {
  studentId: string;
  studentName: string;
  status: string | null;
  note: string | null;
}

@Injectable()
@QueryHandler(GetRosterQuery)
export class GetRosterHandler implements IQueryHandler<GetRosterQuery, RosterEntry[]> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetRosterQuery): Promise<RosterEntry[]> {
    const students = await this.studentRepository.find({
      where: { classroomId: query.classroomId },
      order: { name: 'ASC' },
    });
    const records = await this.recordRepository.find({
      where: { classroomId: query.classroomId, date: query.date },
    });
    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    return students.map((s) => {
      const record = byStudent.get(s.id);
      return {
        studentId: s.id,
        studentName: s.name,
        status: record?.status ?? null,
        note: record?.note ?? null,
      };
    });
  }
}
```

- [ ] **Step 5: DTOs + Controller**

```ts
// attendance-api/src/attendance/api/dto/mark-attendance.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class MarkAttendanceDto {
  @ApiProperty()
  @IsUUID()
  student_id: string;

  @ApiProperty()
  @IsUUID()
  classroom_id: string;

  @ApiProperty({ example: '2026-08-28' })
  @IsString()
  date: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiProperty({ required: false, example: 'Picked up early by uncle' })
  @IsOptional()
  @IsString()
  note?: string;
}
```

```ts
// attendance-api/src/attendance/api/dto/bulk-mark-attendance.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsEnum, IsString, IsUUID } from 'class-validator';
import { AttendanceStatus } from '../../infrastructure/entities/attendance-record.entity';

export class BulkMarkAttendanceDto {
  @ApiProperty({ type: [String] })
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  student_ids: string[];

  @ApiProperty()
  @IsUUID()
  classroom_id: string;

  @ApiProperty({ example: '2026-08-28' })
  @IsString()
  date: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}
```

```ts
// attendance-api/src/attendance/api/controllers/attendance.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../../shared/entities/user.entity';
import { MarkAttendanceDto } from '../dto/mark-attendance.dto';
import { BulkMarkAttendanceDto } from '../dto/bulk-mark-attendance.dto';
import { MarkAttendanceCommand } from '../../application/commands/mark-attendance.command';
import { BulkMarkAttendanceCommand } from '../../application/commands/bulk-mark-attendance.command';
import { GetRosterQuery } from '../../application/queries/get-roster.query';

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: "Get a classroom's roster with a given date's status" })
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get('roster')
  roster(@Query('classroom_id') classroomId: string, @Query('date') date: string) {
    return this.queryBus.execute(new GetRosterQuery(classroomId, date));
  }

  @ApiOperation({ summary: "Mark (or edit) one student's attendance for a day" })
  @Roles(UserRole.TEACHER)
  @Post('mark')
  mark(@Body() dto: MarkAttendanceDto, @CurrentUser() userId: string) {
    return this.commandBus.execute(
      new MarkAttendanceCommand(
        dto.student_id,
        dto.classroom_id,
        dto.date,
        dto.status,
        dto.note ?? null,
        userId,
      ),
    );
  }

  @ApiOperation({ summary: 'Bulk-mark a set of students the same status (e.g. "mark all present")' })
  @Roles(UserRole.TEACHER)
  @Post('bulk-mark')
  bulkMark(@Body() dto: BulkMarkAttendanceDto, @CurrentUser() userId: string) {
    return this.commandBus.execute(
      new BulkMarkAttendanceCommand(dto.student_ids, dto.classroom_id, dto.date, dto.status, userId),
    );
  }
}
```

- [ ] **Step 6: Module**

```ts
// attendance-api/src/attendance/attendance.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from './infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from './infrastructure/entities/attendance-audit-log.entity';
import { AttendanceController } from './api/controllers/attendance.controller';
import { MarkAttendanceHandler } from './application/commands/mark-attendance.handler';
import { BulkMarkAttendanceHandler } from './application/commands/bulk-mark-attendance.handler';
import { GetRosterHandler } from './application/queries/get-roster.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([StudentEntity, AttendanceRecordEntity, AttendanceAuditLogEntity]),
    JwtModule.register({}),
  ],
  controllers: [AttendanceController],
  providers: [MarkAttendanceHandler, BulkMarkAttendanceHandler, GetRosterHandler],
})
export class AttendanceModule {}
```

Then add `AttendanceModule` to `attendance-api/src/app.module.ts`.

- [ ] **Step 7: Tests**

```ts
// attendance-api/test/unit/attendance/mark-attendance.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventBus } from '@nestjs/cqrs';
import { MarkAttendanceHandler } from '../../../src/attendance/application/commands/mark-attendance.handler';
import { MarkAttendanceCommand } from '../../../src/attendance/application/commands/mark-attendance.command';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../../src/attendance/infrastructure/entities/attendance-record.entity';
import { AttendanceAuditLogEntity } from '../../../src/attendance/infrastructure/entities/attendance-audit-log.entity';
import { AttendanceMarkedEvent } from '../../../src/attendance/domain/events/attendance-marked.event';

describe('MarkAttendanceHandler', () => {
  let handler: MarkAttendanceHandler;
  let recordRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock };
  let auditRepo: { save: jest.Mock };
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    recordRepo = {
      findOneBy: jest.fn(),
      create: jest.fn((v: Partial<AttendanceRecordEntity>) => v as AttendanceRecordEntity),
      save: jest.fn(async (v: AttendanceRecordEntity) => v),
    };
    auditRepo = { save: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MarkAttendanceHandler,
        { provide: getRepositoryToken(AttendanceRecordEntity), useValue: recordRepo },
        { provide: getRepositoryToken(AttendanceAuditLogEntity), useValue: auditRepo },
        { provide: EventBus, useValue: eventBus },
      ],
    }).compile();

    handler = module.get(MarkAttendanceHandler);
  });

  it('creates a fresh record with no audit log when none exists yet', async () => {
    recordRepo.findOneBy.mockResolvedValue(null);

    const result = await handler.execute(
      new MarkAttendanceCommand('student-1', 'class-1', '2026-08-28', AttendanceStatus.PRESENT, null, 'teacher-1'),
    );

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(auditRepo.save).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AttendanceMarkedEvent));
  });

  it('writes an audit log entry when re-marking an existing record', async () => {
    recordRepo.findOneBy.mockResolvedValue({
      id: 'record-1',
      studentId: 'student-1',
      classroomId: 'class-1',
      date: '2026-08-28',
      status: AttendanceStatus.PRESENT,
      note: null,
      markedByUserId: 'teacher-1',
    });

    const result = await handler.execute(
      new MarkAttendanceCommand(
        'student-1',
        'class-1',
        '2026-08-28',
        AttendanceStatus.ABSENT,
        'Sick',
        'teacher-2',
      ),
    );

    expect(result.status).toBe(AttendanceStatus.ABSENT);
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceRecordId: 'record-1',
        previousStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.ABSENT,
        changedByUserId: 'teacher-2',
      }),
    );
  });
});
```

```ts
// attendance-api/test/unit/attendance/bulk-mark-attendance.handler.spec.ts
import { Test } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { BulkMarkAttendanceHandler } from '../../../src/attendance/application/commands/bulk-mark-attendance.handler';
import { BulkMarkAttendanceCommand } from '../../../src/attendance/application/commands/bulk-mark-attendance.command';
import { MarkAttendanceCommand } from '../../../src/attendance/application/commands/mark-attendance.command';
import { AttendanceStatus } from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('BulkMarkAttendanceHandler', () => {
  let handler: BulkMarkAttendanceHandler;
  let commandBus: { execute: jest.Mock };

  beforeEach(async () => {
    commandBus = { execute: jest.fn().mockResolvedValue({ id: 'record' }) };
    const module = await Test.createTestingModule({
      providers: [BulkMarkAttendanceHandler, { provide: CommandBus, useValue: commandBus }],
    }).compile();
    handler = module.get(BulkMarkAttendanceHandler);
  });

  it('dispatches one MarkAttendanceCommand per student', async () => {
    const result = await handler.execute(
      new BulkMarkAttendanceCommand(
        ['student-1', 'student-2'],
        'class-1',
        '2026-08-28',
        AttendanceStatus.PRESENT,
        'teacher-1',
      ),
    );

    expect(result).toHaveLength(2);
    expect(commandBus.execute).toHaveBeenCalledTimes(2);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining(
        new MarkAttendanceCommand('student-1', 'class-1', '2026-08-28', AttendanceStatus.PRESENT, null, 'teacher-1'),
      ),
    );
  });
});
```

```ts
// attendance-api/test/unit/attendance/get-roster.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetRosterHandler } from '../../../src/attendance/application/queries/get-roster.handler';
import { GetRosterQuery } from '../../../src/attendance/application/queries/get-roster.query';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import {
  AttendanceRecordEntity,
  AttendanceStatus,
} from '../../../src/attendance/infrastructure/entities/attendance-record.entity';

describe('GetRosterHandler', () => {
  let handler: GetRosterHandler;
  let studentRepo: { find: jest.Mock };
  let recordRepo: { find: jest.Mock };

  beforeEach(async () => {
    studentRepo = { find: jest.fn() };
    recordRepo = { find: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GetRosterHandler,
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: getRepositoryToken(AttendanceRecordEntity), useValue: recordRepo },
      ],
    }).compile();
    handler = module.get(GetRosterHandler);
  });

  it('pairs each student with their status for the day, or null if unmarked', async () => {
    studentRepo.find.mockResolvedValue([
      { id: 'student-1', name: 'Dara' },
      { id: 'student-2', name: 'Sokha' },
    ]);
    recordRepo.find.mockResolvedValue([
      { studentId: 'student-1', status: AttendanceStatus.PRESENT, note: null },
    ]);

    const result = await handler.execute(new GetRosterQuery('class-1', '2026-08-28'));

    expect(result).toEqual([
      { studentId: 'student-1', studentName: 'Dara', status: AttendanceStatus.PRESENT, note: null },
      { studentId: 'student-2', studentName: 'Sokha', status: null, note: null },
    ]);
  });
});
```

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npx tsc --noEmit && npm test -- --testPathPattern=attendance`
Expected: PASS.

```bash
git add src/attendance src/app.module.ts test/unit/attendance
git commit -m "feat: attendance marking with edit audit log"
```

---

## Task 5: Telegram webhook — `/start`, `/link`, `/status` (backend)

Depends on Tasks 3 and 4 (needs `LinkingCodeEntity`, `ParentLinkEntity`, `StudentEntity`, `AttendanceRecordEntity`). Extends the existing `notification` module rather than creating a new one — the webhook, `LinkParentCommand`, and `GetAttendanceStatusQuery` are all "telegram bot" concerns, and per the Global Constraints they reach the other modules' entities via cross-module `forFeature`, same as `category.module.ts` already does with `MerchantEntity`.

**Files:**
- Modify: `attendance-api/config/configuration.ts` (add `telegram.webhookSecret`)
- Modify: `attendance-api/.env.example` (add `TELEGRAM_WEBHOOK_SECRET`)
- Create: `attendance-api/src/notification/application/commands/link-parent.command.ts`
- Create: `attendance-api/src/notification/application/commands/link-parent.handler.ts`
- Create: `attendance-api/src/notification/application/queries/get-attendance-status.query.ts`
- Create: `attendance-api/src/notification/application/queries/get-attendance-status.handler.ts`
- Create: `attendance-api/src/notification/api/controllers/telegram-webhook.controller.ts`
- Modify: `attendance-api/src/notification/notification.module.ts` (register the above + cross-module `forFeature`)
- Modify: `attendance-api/README.md` (bot setup instructions)
- Test: `attendance-api/test/unit/notification/link-parent.handler.spec.ts`

**Interfaces:**
- Produces: `POST /telegram/webhook` (no JWT — guarded by `X-Telegram-Bot-Api-Secret-Token` header matching `TELEGRAM_WEBHOOK_SECRET`), `LinkParentCommand(telegramChatId, code)`, `GetAttendanceStatusQuery(telegramChatId)`.
- Consumes: `TELEGRAM_SERVICE` (from Task-0 scaffold), `LinkingCodeEntity`/`ParentLinkEntity` (Task 3), `StudentEntity` (Task 2), `AttendanceRecordEntity` (Task 4).

- [ ] **Step 1: Config + env**

In `attendance-api/config/configuration.ts`, change the `telegram` block to:

```ts
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    },
```

In `attendance-api/.env.example`, add below `TELEGRAM_BOT_TOKEN=`:

```
TELEGRAM_WEBHOOK_SECRET=
```

- [ ] **Step 2: LinkParentCommand**

```ts
// attendance-api/src/notification/application/commands/link-parent.command.ts
export class LinkParentCommand {
  constructor(
    public readonly telegramChatId: string,
    public readonly code: string,
  ) {}
}
```

```ts
// attendance-api/src/notification/application/commands/link-parent.handler.ts
import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkingCodeEntity } from '../../../parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE, type ITelegramService } from '../interfaces/telegram.service';
import { LinkParentCommand } from './link-parent.command';

@Injectable()
@CommandHandler(LinkParentCommand)
export class LinkParentHandler implements ICommandHandler<LinkParentCommand, void> {
  constructor(
    @InjectRepository(LinkingCodeEntity)
    private readonly linkingCodeRepository: Repository<LinkingCodeEntity>,
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  async execute(command: LinkParentCommand): Promise<void> {
    const { telegramChatId, code } = command;

    const linkingCode = await this.linkingCodeRepository.findOneBy({ code: code.toUpperCase() });
    if (!linkingCode || linkingCode.usedAt !== null || linkingCode.expiresAt.getTime() < Date.now()) {
      await this.telegram.sendMessage(
        telegramChatId,
        'That code is invalid or expired. Ask your school for a new one.',
      );
      return;
    }

    const student = await this.studentRepository.findOneBy({ id: linkingCode.studentId });
    if (!student) {
      await this.telegram.sendMessage(telegramChatId, 'That code is invalid or expired.');
      return;
    }

    await this.parentLinkRepository.save({
      id: crypto.randomUUID(),
      studentId: student.id,
      telegramChatId,
    });
    linkingCode.usedAt = new Date();
    await this.linkingCodeRepository.save(linkingCode);

    await this.telegram.sendMessage(telegramChatId, `You're now linked to ${student.name}.`);
  }
}
```

- [ ] **Step 3: GetAttendanceStatusQuery**

```ts
// attendance-api/src/notification/application/queries/get-attendance-status.query.ts
export class GetAttendanceStatusQuery {
  constructor(public readonly telegramChatId: string) {}
}
```

```ts
// attendance-api/src/notification/application/queries/get-attendance-status.handler.ts
import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { AttendanceRecordEntity } from '../../../attendance/infrastructure/entities/attendance-record.entity';
import { GetAttendanceStatusQuery } from './get-attendance-status.query';

@Injectable()
@QueryHandler(GetAttendanceStatusQuery)
export class GetAttendanceStatusHandler implements IQueryHandler<GetAttendanceStatusQuery, string> {
  constructor(
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepository: Repository<AttendanceRecordEntity>,
  ) {}

  async execute(query: GetAttendanceStatusQuery): Promise<string> {
    const links = await this.parentLinkRepository.find({
      where: { telegramChatId: query.telegramChatId },
    });
    if (links.length === 0) {
      return "You haven't linked a child yet. Send /link <code> first.";
    }

    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    for (const link of links) {
      const student = await this.studentRepository.findOneBy({ id: link.studentId });
      if (!student) continue;
      const record = await this.recordRepository.findOneBy({ studentId: link.studentId, date: today });
      lines.push(`${student.name}: ${record ? record.status : 'not marked yet'}`);
    }
    return lines.join('\n');
  }
}
```

- [ ] **Step 4: Webhook controller**

```ts
// attendance-api/src/notification/api/controllers/telegram-webhook.controller.ts
import { Body, Controller, ForbiddenException, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { TELEGRAM_SERVICE, type ITelegramService } from '../../application/interfaces/telegram.service';
import { LinkParentCommand } from '../../application/commands/link-parent.command';
import { GetAttendanceStatusQuery } from '../../application/queries/get-attendance-status.query';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  @HttpCode(200)
  @Post('webhook')
  async handleUpdate(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
  ): Promise<{ ok: true }> {
    const expectedSecret = this.configService.get<string>('telegram.webhookSecret');
    if (expectedSecret && secretHeader !== expectedSecret) {
      throw new ForbiddenException();
    }

    const chatId = update.message?.chat.id.toString();
    const text = update.message?.text?.trim();
    if (!chatId || !text) {
      return { ok: true };
    }

    if (text === '/start') {
      await this.telegram.sendMessage(
        chatId,
        "Welcome! Ask your school for a linking code, then send /link <code> to connect your child's attendance.",
      );
    } else if (text.startsWith('/link')) {
      const code = text.split(/\s+/)[1];
      if (!code) {
        await this.telegram.sendMessage(chatId, 'Usage: /link <code>');
      } else {
        await this.commandBus.execute(new LinkParentCommand(chatId, code));
      }
    } else if (text === '/status') {
      const message = await this.queryBus.execute<GetAttendanceStatusQuery, string>(
        new GetAttendanceStatusQuery(chatId),
      );
      await this.telegram.sendMessage(chatId, message);
    } else {
      await this.telegram.sendMessage(chatId, 'Unknown command. Try /status.');
    }

    return { ok: true };
  }
}
```

- [ ] **Step 5: Wire notification.module.ts**

Replace `attendance-api/src/notification/notification.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../parent-link/infrastructure/entities/parent-link.entity';
import { AttendanceRecordEntity } from '../attendance/infrastructure/entities/attendance-record.entity';
import { NotificationController } from './api/controllers/notification.controller';
import { TelegramWebhookController } from './api/controllers/telegram-webhook.controller';
import { SendNotificationHandler } from './application/commands/send-notification.handler';
import { LinkParentHandler } from './application/commands/link-parent.handler';
import { GetAttendanceStatusHandler } from './application/queries/get-attendance-status.handler';
import { TELEGRAM_SERVICE } from './application/interfaces/telegram.service';
import { TelegramService } from './infrastructure/services/telegram.service';

@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([StudentEntity, LinkingCodeEntity, ParentLinkEntity, AttendanceRecordEntity]),
  ],
  controllers: [NotificationController, TelegramWebhookController],
  providers: [
    SendNotificationHandler,
    LinkParentHandler,
    GetAttendanceStatusHandler,
    { provide: TELEGRAM_SERVICE, useClass: TelegramService },
  ],
  exports: [TELEGRAM_SERVICE],
})
export class NotificationModule {}
```

(Task 6 below adds `AttendanceMarkedNotificationHandler` to this same `providers` array — don't duplicate the module rewrite, just add one more provider.)

- [ ] **Step 6: Bot setup docs**

Append to `attendance-api/README.md`:

```markdown
## Telegram bot setup (for parent notifications)

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts. Copy the token into `TELEGRAM_BOT_TOKEN` in `.env`.
2. Generate a webhook secret and put it in `TELEGRAM_WEBHOOK_SECRET` (e.g. `openssl rand -hex 16`).
3. Expose your local API over HTTPS with a tunnel, e.g. `cloudflared tunnel --url http://localhost:8091` or `ngrok http 8091`. Note the public HTTPS URL it prints.
4. Register the webhook with Telegram:
   \`\`\`bash
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -H 'Content-Type: application/json' \
     -d '{"url": "<TUNNEL_URL>/telegram/webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
   \`\`\`
5. Message your bot on Telegram: `/start`, then `/link <code>` using a code generated from the admin dashboard's Students screen.
```

- [ ] **Step 7: Test**

```ts
// attendance-api/test/unit/notification/link-parent.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LinkParentHandler } from '../../../src/notification/application/commands/link-parent.handler';
import { LinkParentCommand } from '../../../src/notification/application/commands/link-parent.command';
import { LinkingCodeEntity } from '../../../src/parent-link/infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../../src/parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';

describe('LinkParentHandler', () => {
  let handler: LinkParentHandler;
  let linkingCodeRepo: { findOneBy: jest.Mock; save: jest.Mock };
  let parentLinkRepo: { save: jest.Mock };
  let studentRepo: { findOneBy: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    linkingCodeRepo = { findOneBy: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    parentLinkRepo = { save: jest.fn().mockResolvedValue(undefined) };
    studentRepo = { findOneBy: jest.fn() };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        LinkParentHandler,
        { provide: getRepositoryToken(LinkingCodeEntity), useValue: linkingCodeRepo },
        { provide: getRepositoryToken(ParentLinkEntity), useValue: parentLinkRepo },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
      ],
    }).compile();

    handler = module.get(LinkParentHandler);
  });

  it('rejects an unknown code without creating a link', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue(null);
    await handler.execute(new LinkParentCommand('chat-1', 'BADCODE1'));
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('invalid or expired'),
    );
  });

  it('rejects an already-used code', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    });
    await handler.execute(new LinkParentCommand('chat-1', 'abcd1234'));
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    linkingCodeRepo.findOneBy.mockResolvedValue({
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await handler.execute(new LinkParentCommand('chat-1', 'ABCD1234'));
    expect(parentLinkRepo.save).not.toHaveBeenCalled();
  });

  it('links the parent and marks the code used on success', async () => {
    const linkingCode = {
      code: 'ABCD1234',
      studentId: 'student-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    linkingCodeRepo.findOneBy.mockResolvedValue(linkingCode);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.execute(new LinkParentCommand('chat-1', 'ABCD1234'));

    expect(parentLinkRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'student-1', telegramChatId: 'chat-1' }),
    );
    expect(linkingCodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
    expect(telegramService.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('Sokha'),
    );
  });
});
```

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npx tsc --noEmit && npm test -- --testPathPattern=notification`
Expected: PASS.

```bash
git add src/notification config/configuration.ts .env.example README.md test/unit/notification
git commit -m "feat: telegram webhook (/start /link /status)"
```

---

## Task 6: Attendance → parent Telegram notification (backend)

Depends on Task 4 (`AttendanceMarkedEvent`) and Task 5 (`notification.module.ts` already touched — this task adds one more provider to it, don't redo Step 5 above). **Files:**
- Create: `attendance-api/src/notification/application/events/attendance-marked-notification.handler.ts`
- Modify: `attendance-api/src/notification/notification.module.ts` (add `AttendanceMarkedNotificationHandler` to `providers`)
- Test: `attendance-api/test/unit/notification/attendance-marked-notification.handler.spec.ts`

**Interfaces:**
- Consumes: `AttendanceMarkedEvent` (class import only, per the async-communication rule), `ParentLinkEntity`, `StudentEntity`, `TELEGRAM_SERVICE`.

- [ ] **Step 1: Handler**

```ts
// attendance-api/src/notification/application/events/attendance-marked-notification.handler.ts
import { Inject, Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceMarkedEvent } from '../../../attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE, type ITelegramService } from '../interfaces/telegram.service';

const STATUS_LABEL: Record<string, string> = {
  present: '✅ present',
  absent: '❌ absent',
  late: '⏰ late',
};

@Injectable()
@EventsHandler(AttendanceMarkedEvent)
export class AttendanceMarkedNotificationHandler implements IEventHandler<AttendanceMarkedEvent> {
  constructor(
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @Inject(TELEGRAM_SERVICE) private readonly telegram: ITelegramService,
  ) {}

  async handle(event: AttendanceMarkedEvent): Promise<void> {
    const links = await this.parentLinkRepository.find({ where: { studentId: event.studentId } });
    if (links.length === 0) return;

    const student = await this.studentRepository.findOneBy({ id: event.studentId });
    const label = STATUS_LABEL[event.status] ?? event.status;
    const noteText = event.note ? `\nNote: ${event.note}` : '';
    const text = `${student?.name ?? 'Your child'} was marked ${label} on ${event.date}.${noteText}`;

    for (const link of links) {
      try {
        await this.telegram.sendMessage(link.telegramChatId, text);
      } catch {
        /* fire-and-forget, same as the rest of the notification module */
      }
    }
  }
}
```

- [ ] **Step 2: Wire into notification.module.ts**

Add the import and add `AttendanceMarkedNotificationHandler` to the `providers` array from Task 5 Step 5.

- [ ] **Step 3: Test**

```ts
// attendance-api/test/unit/notification/attendance-marked-notification.handler.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendanceMarkedNotificationHandler } from '../../../src/notification/application/events/attendance-marked-notification.handler';
import { AttendanceMarkedEvent } from '../../../src/attendance/domain/events/attendance-marked.event';
import { ParentLinkEntity } from '../../../src/parent-link/infrastructure/entities/parent-link.entity';
import { StudentEntity } from '../../../src/student/infrastructure/entities/student.entity';
import { TELEGRAM_SERVICE } from '../../../src/notification/application/interfaces/telegram.service';

describe('AttendanceMarkedNotificationHandler', () => {
  let handler: AttendanceMarkedNotificationHandler;
  let parentLinkRepo: { find: jest.Mock };
  let studentRepo: { findOneBy: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    parentLinkRepo = { find: jest.fn() };
    studentRepo = { findOneBy: jest.fn() };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AttendanceMarkedNotificationHandler,
        { provide: getRepositoryToken(ParentLinkEntity), useValue: parentLinkRepo },
        { provide: getRepositoryToken(StudentEntity), useValue: studentRepo },
        { provide: TELEGRAM_SERVICE, useValue: telegramService },
      ],
    }).compile();

    handler = module.get(AttendanceMarkedNotificationHandler);
  });

  it('does nothing when the student has no linked parents', async () => {
    parentLinkRepo.find.mockResolvedValue([]);
    await handler.handle(new AttendanceMarkedEvent('student-1', 'class-1', '2026-08-28', 'present', null));
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a message to every linked parent chat', async () => {
    parentLinkRepo.find.mockResolvedValue([
      { telegramChatId: 'chat-1' },
      { telegramChatId: 'chat-2' },
    ]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });

    await handler.handle(new AttendanceMarkedEvent('student-1', 'class-1', '2026-08-28', 'absent', 'Sick'));

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(2);
    expect(telegramService.sendMessage).toHaveBeenCalledWith('chat-1', expect.stringContaining('Sokha'));
    expect(telegramService.sendMessage).toHaveBeenCalledWith('chat-1', expect.stringContaining('absent'));
  });

  it('does not let one failed send stop the others', async () => {
    parentLinkRepo.find.mockResolvedValue([{ telegramChatId: 'chat-1' }, { telegramChatId: 'chat-2' }]);
    studentRepo.findOneBy.mockResolvedValue({ id: 'student-1', name: 'Sokha' });
    telegramService.sendMessage.mockRejectedValueOnce(new Error('Telegram API error'));

    await handler.handle(new AttendanceMarkedEvent('student-1', 'class-1', '2026-08-28', 'late', null));

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: PASS, all suites (this is the last backend task — full suite should be green).

```bash
git add src/notification test/unit/notification
git commit -m "feat: notify linked parents when attendance is marked"
```

---

## Task 7: Wire app.module.ts + demo seed data (backend)

Depends on Tasks 1–6 all being merged (needs every module to exist). **Files:**
- Modify: `attendance-api/src/app.module.ts`
- Modify: `attendance-api/database/seeds/data-source.ts` (register `ClassroomEntity`, `StudentEntity`)
- Modify: `attendance-api/database/seeds/seed.ts`
- Create: `attendance-api/database/seeds/seeders/classrooms.seeder.ts`
- Create: `attendance-api/database/seeds/seeders/students.seeder.ts`

- [ ] **Step 1: app.module.ts**

```ts
// attendance-api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from '../config/configuration';
import { typeOrmConfigFactory } from './typeorm.config';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { ClassroomModule } from './classroom/classroom.module';
import { StudentModule } from './student/student.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ParentLinkModule } from './parent-link/parent-link.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: typeOrmConfigFactory }),
    SharedModule,
    AuthModule,
    ClassroomModule,
    StudentModule,
    ParentLinkModule,
    AttendanceModule,
    NotificationModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Seed data-source.ts entity list**

In `attendance-api/database/seeds/data-source.ts`, add imports and extend the `entities` array:

```ts
import { ClassroomEntity } from '../../src/classroom/infrastructure/entities/classroom.entity';
import { StudentEntity } from '../../src/student/infrastructure/entities/student.entity';
// ...
entities: [UserEntity, RefreshTokenEntity, PasswordResetTokenEntity, ClassroomEntity, StudentEntity],
```

- [ ] **Step 3: Seeders**

```ts
// attendance-api/database/seeds/seeders/classrooms.seeder.ts
import { DataSource, Repository } from 'typeorm';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';
import type { UserEntity } from '../../../src/shared/entities/user.entity';

export async function seedClassrooms(
  dataSource: DataSource,
  teacher: UserEntity,
): Promise<ClassroomEntity[]> {
  const repo: Repository<ClassroomEntity> = dataSource.getRepository(ClassroomEntity);
  const existing = await repo.findOneBy({ name: 'Grade 3A' });
  if (existing) {
    console.log('  [skip] classroom "Grade 3A" already exists');
    return [existing];
  }

  const classroom = repo.create({
    id: crypto.randomUUID(),
    name: 'Grade 3A',
    gradeLabel: 'Grade 3',
    teacherId: teacher.id,
  });
  await repo.save(classroom);
  console.log(`  [+] classroom "${classroom.name}"`);
  return [classroom];
}
```

```ts
// attendance-api/database/seeds/seeders/students.seeder.ts
import { DataSource, Repository } from 'typeorm';
import { StudentEntity, StudentStatus } from '../../../src/student/infrastructure/entities/student.entity';
import { ClassroomEntity } from '../../../src/classroom/infrastructure/entities/classroom.entity';

const NAMES = ['Sokha', 'Dara'];

export async function seedStudents(
  dataSource: DataSource,
  classroom: ClassroomEntity,
): Promise<StudentEntity[]> {
  const repo: Repository<StudentEntity> = dataSource.getRepository(StudentEntity);
  const results: StudentEntity[] = [];

  for (const name of NAMES) {
    const existing = await repo.findOneBy({ name, classroomId: classroom.id });
    if (existing) {
      console.log(`  [skip] student "${name}" already exists`);
      results.push(existing);
      continue;
    }
    const student = repo.create({
      id: crypto.randomUUID(),
      name,
      classroomId: classroom.id,
      status: StudentStatus.ACTIVE,
    });
    await repo.save(student);
    console.log(`  [+] student "${name}"`);
    results.push(student);
  }

  return results;
}
```

- [ ] **Step 4: seed.ts**

```ts
// attendance-api/database/seeds/seed.ts
import { AppDataSource } from './data-source';
import { seedUsers } from './seeders/users.seeder';
import { seedClassrooms } from './seeders/classrooms.seeder';
import { seedStudents } from './seeders/students.seeder';

async function main() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Connected.\n');

  console.log('Seeding users...');
  const users = await seedUsers(AppDataSource);
  const teacher = users.find((u) => u.email === 'teacher@attendance.dev')!;

  console.log('\nSeeding classrooms...');
  const [classroom] = await seedClassrooms(AppDataSource, teacher);

  console.log('\nSeeding students...');
  await seedStudents(AppDataSource, classroom);

  console.log('\nDone.');
  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Verify and commit**

Run: `docker compose up -d && npm run start:dev` (in one terminal), then in another: `npm run seed`.
Expected: app boots with all 7 modules' routes logged (`GET/POST /classrooms`, `/students`, `/attendance/*`, `/parent-links/*`, `/telegram/webhook`, plus the Task-0 auth/notification routes); seed logs `[+] classroom "Grade 3A"`, `[+] student "Sokha"`, `[+] student "Dara"`.

```bash
git add src/app.module.ts database/seeds
git commit -m "feat: wire domain modules into AppModule, seed demo classroom/students"
```

---

## Task 8: Classrooms feature slice (frontend, admin)

Depends on backend Task 1. **Files:**
- Create: `attendance-admin/src/features/classrooms/types.ts`
- Create: `attendance-admin/src/features/classrooms/schemas/classroom.schema.ts`
- Create: `attendance-admin/src/features/classrooms/schemas/index.ts`
- Create: `attendance-admin/src/features/classrooms/actions/classrooms.action.ts`
- Create: `attendance-admin/src/features/classrooms/actions/index.ts`
- Create: `attendance-admin/src/features/classrooms/hooks/use-classrooms.ts`
- Create: `attendance-admin/src/features/classrooms/components/classrooms-screen.tsx`
- Create: `attendance-admin/src/app/(dashboard)/classrooms/page.tsx`

**Interfaces:**
- Produces: `useClassrooms()` hook returning `UseQueryResult<Classroom[]>` — **consumed by Task 9 and Task 10** (the two documented cross-slice exceptions).

- [ ] **Step 1: Types + schema**

```ts
// attendance-admin/src/features/classrooms/types.ts
export interface Classroom {
  id: string
  name: string
  gradeLabel: string | null
  teacherId: string | null
}
```

```ts
// attendance-admin/src/features/classrooms/schemas/classroom.schema.ts
import { z } from 'zod'

export const classroomSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  gradeLabel: z.string().optional(),
})

export type ClassroomInput = z.infer<typeof classroomSchema>
```

```ts
// attendance-admin/src/features/classrooms/schemas/index.ts
export { classroomSchema, type ClassroomInput } from './classroom.schema'
```

- [ ] **Step 2: Actions**

```ts
// attendance-admin/src/features/classrooms/actions/classrooms.action.ts
'use server'

import { revalidatePath } from 'next/cache'
import { ApiError, apiFetch } from '@/lib/api/server'
import type { Classroom } from '../types'
import type { ClassroomInput } from '../schemas'

interface ClassroomApi {
  id: string
  name: string
  grade_label: string | null
  teacher_id: string | null
}

function toClassroom(api: ClassroomApi): Classroom {
  return { id: api.id, name: api.name, gradeLabel: api.grade_label, teacherId: api.teacher_id }
}

export async function listClassrooms(): Promise<Classroom[]> {
  const items = await apiFetch<ClassroomApi[]>('/classrooms')
  return items.map(toClassroom)
}

export async function createClassroom(input: ClassroomInput): Promise<{ error?: string }> {
  try {
    await apiFetch('/classrooms', {
      method: 'POST',
      body: JSON.stringify({ name: input.name, grade_label: input.gradeLabel || null }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to create classroom' }
  }
  revalidatePath('/dashboard/classrooms')
  return {}
}

export async function deleteClassroom(id: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/classrooms/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to delete classroom' }
  }
  revalidatePath('/dashboard/classrooms')
  return {}
}
```

```ts
// attendance-admin/src/features/classrooms/actions/index.ts
export { listClassrooms, createClassroom, deleteClassroom } from './classrooms.action'
```

- [ ] **Step 3: Hook**

```ts
// attendance-admin/src/features/classrooms/hooks/use-classrooms.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { listClassrooms } from '../actions'

export function useClassrooms() {
  return useQuery({ queryKey: ['classrooms'], queryFn: listClassrooms })
}
```

- [ ] **Step 4: Screen**

```tsx
// attendance-admin/src/features/classrooms/components/classrooms-screen.tsx
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2 items-end">
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
        <QueryState
          isPending={query.isPending}
          message="Couldn't load classrooms."
          onRetry={() => query.refetch()}
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {query.data.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-3">
              <span>
                {c.name} {c.gradeLabel && <span className="text-muted-foreground">— {c.gradeLabel}</span>}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onDelete(c.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 5: Route page**

```tsx
// attendance-admin/src/app/(dashboard)/classrooms/page.tsx
import type { Metadata } from 'next'
import { ClassroomsScreen } from '@/features/classrooms/components/classrooms-screen'

export const metadata: Metadata = { title: 'Classrooms — Attendance' }

export default function ClassroomsPage() {
  return <ClassroomsScreen />
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors. Manually verify by logging in as admin and visiting `/dashboard/classrooms` once Task 11 wires the nav link (or navigate to the URL directly for now).

```bash
git add src/features/classrooms src/app/\(dashboard\)/classrooms
git commit -m "feat: classrooms admin screen"
```

---

## Task 9: Students feature slice (frontend, admin)

Depends on backend Tasks 2 and 3, and frontend Task 8 (`useClassrooms` — documented cross-slice exception for the classroom picker and name lookup). **Files:**
- Create: `attendance-admin/src/features/students/types.ts`
- Create: `attendance-admin/src/features/students/schemas/student.schema.ts`
- Create: `attendance-admin/src/features/students/schemas/index.ts`
- Create: `attendance-admin/src/features/students/actions/students.action.ts`
- Create: `attendance-admin/src/features/students/actions/index.ts`
- Create: `attendance-admin/src/features/students/hooks/use-students.ts`
- Create: `attendance-admin/src/features/students/components/students-screen.tsx`
- Create: `attendance-admin/src/app/(dashboard)/students/page.tsx`
- Modify: `attendance-admin/CLAUDE.md` (document the `students → classrooms` exception)

- [ ] **Step 1: Types + schema**

```ts
// attendance-admin/src/features/students/types.ts
export interface Student {
  id: string
  name: string
  classroomId: string
  status: 'active' | 'inactive'
}

export interface LinkingStatus {
  studentId: string
  studentName: string
  linked: boolean
  activeCode: string | null
}
```

```ts
// attendance-admin/src/features/students/schemas/student.schema.ts
import { z } from 'zod'

export const studentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  classroomId: z.string().min(1, 'Classroom is required'),
})

export type StudentInput = z.infer<typeof studentSchema>
```

```ts
// attendance-admin/src/features/students/schemas/index.ts
export { studentSchema, type StudentInput } from './student.schema'
```

- [ ] **Step 2: Actions**

```ts
// attendance-admin/src/features/students/actions/students.action.ts
'use server'

import { revalidatePath } from 'next/cache'
import { ApiError, apiFetch } from '@/lib/api/server'
import type { LinkingStatus, Student } from '../types'
import type { StudentInput } from '../schemas'

interface StudentApi {
  id: string
  name: string
  classroom_id: string
  status: 'active' | 'inactive'
}

function toStudent(api: StudentApi): Student {
  return { id: api.id, name: api.name, classroomId: api.classroom_id, status: api.status }
}

export async function listStudents(classroomId?: string): Promise<Student[]> {
  const query = classroomId ? `?classroom_id=${classroomId}` : ''
  const items = await apiFetch<StudentApi[]>(`/students${query}`)
  return items.map(toStudent)
}

export async function createStudent(input: StudentInput): Promise<{ error?: string }> {
  try {
    await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify({ name: input.name, classroom_id: input.classroomId }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to add student' }
  }
  revalidatePath('/dashboard/students')
  return {}
}

export async function deleteStudent(id: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/students/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to remove student' }
  }
  revalidatePath('/dashboard/students')
  return {}
}

interface LinkingStatusApi {
  student_id: string
  student_name: string
  linked: boolean
  active_code: string | null
}

export async function getLinkingStatus(): Promise<LinkingStatus[]> {
  const items = await apiFetch<LinkingStatusApi[]>('/parent-links/status')
  return items.map((i) => ({
    studentId: i.student_id,
    studentName: i.student_name,
    linked: i.linked,
    activeCode: i.active_code,
  }))
}

interface LinkingCodeApi {
  code: string
}

export async function generateLinkingCode(studentId: string): Promise<{ code?: string; error?: string }> {
  try {
    const result = await apiFetch<LinkingCodeApi>('/parent-links/codes', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    })
    revalidatePath('/dashboard/students')
    return { code: result.code }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to generate code' }
  }
}
```

```ts
// attendance-admin/src/features/students/actions/index.ts
export {
  listStudents,
  createStudent,
  deleteStudent,
  getLinkingStatus,
  generateLinkingCode,
} from './students.action'
```

- [ ] **Step 3: Hooks**

```ts
// attendance-admin/src/features/students/hooks/use-students.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { listStudents, getLinkingStatus } from '../actions'

export function useStudents(classroomId?: string) {
  return useQuery({
    queryKey: ['students', classroomId ?? 'all'],
    queryFn: () => listStudents(classroomId),
  })
}

export function useLinkingStatus() {
  return useQuery({ queryKey: ['linking-status'], queryFn: getLinkingStatus })
}
```

- [ ] **Step 4: Screen**

```tsx
// attendance-admin/src/features/students/components/students-screen.tsx
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

  const form = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: { name: '', classroomId: '' },
  })

  const classroomName = (id: string) => classroomsQuery.data?.find((c) => c.id === id)?.name ?? id
  const linkingByStudent = new Map((linkingQuery.data ?? []).map((l) => [l.studentId, l]))

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
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2 items-end">
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

      {studentsQuery.isPending || studentsQuery.isError ? (
        <QueryState
          isPending={studentsQuery.isPending}
          message="Couldn't load students."
          onRetry={() => studentsQuery.refetch()}
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {studentsQuery.data.map((s) => {
            const linking = linkingByStudent.get(s.id)
            return (
              <li key={s.id} className="flex items-center justify-between p-3">
                <span>
                  {s.name} <span className="text-muted-foreground">— {classroomName(s.classroomId)}</span>{' '}
                  {linking?.linked ? (
                    <span className="text-xs text-green-600">linked</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      unlinked{linking?.activeCode ? ` (code: ${linking.activeCode})` : ''}
                    </span>
                  )}
                </span>
                <span className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onGenerateCode(s.id)}>
                    Generate code
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(s.id)}>
                    Delete
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 5: Route page**

```tsx
// attendance-admin/src/app/(dashboard)/students/page.tsx
import type { Metadata } from 'next'
import { StudentsScreen } from '@/features/students/components/students-screen'

export const metadata: Metadata = { title: 'Students — Attendance' }

export default function StudentsPage() {
  return <StudentsScreen />
}
```

- [ ] **Step 6: Document the cross-slice exception**

In `attendance-admin/CLAUDE.md`, under "Dependency direction," add: `students` slice → imports `useClassrooms` from `classrooms` (classroom picker + name lookup on the students list).

- [ ] **Step 7: Verify and commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors.

```bash
git add src/features/students src/app/\(dashboard\)/students CLAUDE.md
git commit -m "feat: students admin screen with linking codes"
```

---

## Task 10: Attendance feature slice (frontend, teacher)

Depends on backend Task 4, and frontend Task 8 (`useClassrooms` exception again). **Files:**
- Create: `attendance-admin/src/features/attendance/types.ts`
- Create: `attendance-admin/src/features/attendance/actions/attendance.action.ts`
- Create: `attendance-admin/src/features/attendance/actions/index.ts`
- Create: `attendance-admin/src/features/attendance/hooks/use-attendance.ts`
- Create: `attendance-admin/src/features/attendance/components/attendance-screen.tsx`
- Create: `attendance-admin/src/app/(dashboard)/attendance/page.tsx`
- Modify: `attendance-admin/CLAUDE.md` (document the `attendance → classrooms` exception)

- [ ] **Step 1: Types + actions**

```ts
// attendance-admin/src/features/attendance/types.ts
export type AttendanceStatus = 'present' | 'absent' | 'late'

export interface RosterEntry {
  studentId: string
  studentName: string
  status: AttendanceStatus | null
  note: string | null
}
```

```ts
// attendance-admin/src/features/attendance/actions/attendance.action.ts
'use server'

import { ApiError, apiFetch } from '@/lib/api/server'
import type { AttendanceStatus, RosterEntry } from '../types'

interface RosterEntryApi {
  student_id: string
  student_name: string
  status: AttendanceStatus | null
  note: string | null
}

function toRosterEntry(api: RosterEntryApi): RosterEntry {
  return { studentId: api.student_id, studentName: api.student_name, status: api.status, note: api.note }
}

export async function getRoster(classroomId: string, date: string): Promise<RosterEntry[]> {
  const items = await apiFetch<RosterEntryApi[]>(
    `/attendance/roster?classroom_id=${classroomId}&date=${date}`,
  )
  return items.map(toRosterEntry)
}

export async function markAttendance(
  studentId: string,
  classroomId: string,
  date: string,
  status: AttendanceStatus,
  note?: string,
): Promise<{ error?: string }> {
  try {
    await apiFetch('/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, classroom_id: classroomId, date, status, note }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to mark attendance' }
  }
  return {}
}

export async function bulkMarkAttendance(
  studentIds: string[],
  classroomId: string,
  date: string,
  status: AttendanceStatus,
): Promise<{ error?: string }> {
  try {
    await apiFetch('/attendance/bulk-mark', {
      method: 'POST',
      body: JSON.stringify({ student_ids: studentIds, classroom_id: classroomId, date, status }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Failed to bulk-mark attendance' }
  }
  return {}
}
```

```ts
// attendance-admin/src/features/attendance/actions/index.ts
export { getRoster, markAttendance, bulkMarkAttendance } from './attendance.action'
```

- [ ] **Step 2: Hook**

```ts
// attendance-admin/src/features/attendance/hooks/use-attendance.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { getRoster } from '../actions'

export function useRoster(classroomId: string, date: string) {
  return useQuery({
    queryKey: ['roster', classroomId, date],
    queryFn: () => getRoster(classroomId, date),
    enabled: !!classroomId,
  })
}
```

- [ ] **Step 3: Screen**

```tsx
// attendance-admin/src/features/attendance/components/attendance-screen.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/shared/page-shell'
import { QueryState } from '@/components/shared/query-state'
import { Button } from '@/components/ui/button'
import { useClassrooms } from '@/features/classrooms/hooks/use-classrooms'
import { useRoster } from '../hooks/use-attendance'
import { markAttendance, bulkMarkAttendance } from '../actions'
import type { AttendanceStatus } from '../types'

const today = () => new Date().toISOString().slice(0, 10)

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
}

export function AttendanceScreen() {
  const classroomsQuery = useClassrooms()
  const [classroomId, setClassroomId] = useState('')
  const date = today()
  const rosterQuery = useRoster(classroomId, date)
  const queryClient = useQueryClient()

  const invalidateRoster = () => queryClient.invalidateQueries({ queryKey: ['roster', classroomId, date] })

  const onMark = async (studentId: string, status: AttendanceStatus) => {
    const result = await markAttendance(studentId, classroomId, date, status)
    if (result.error) {
      toast.error(result.error)
      return
    }
    await invalidateRoster()
  }

  const onMarkAllPresent = async () => {
    const studentIds = rosterQuery.data?.map((r) => r.studentId) ?? []
    if (studentIds.length === 0) return
    const result = await bulkMarkAttendance(studentIds, classroomId, date, 'present')
    if (result.error) {
      toast.error(result.error)
      return
    }
    await invalidateRoster()
  }

  return (
    <PageShell heading="Today's attendance" description={date}>
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={classroomId}
        onChange={(e) => setClassroomId(e.target.value)}
      >
        <option value="">Select a classroom</option>
        {classroomsQuery.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {!classroomId ? (
        <p className="text-sm text-muted-foreground">Pick a classroom to see its roster.</p>
      ) : rosterQuery.isPending || rosterQuery.isError ? (
        <QueryState
          isPending={rosterQuery.isPending}
          message="Couldn't load the roster."
          onRetry={() => rosterQuery.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Button size="sm" onClick={onMarkAllPresent}>
            Mark all present
          </Button>
          <ul className="divide-y rounded-md border">
            {rosterQuery.data.map((entry) => (
              <li key={entry.studentId} className="flex items-center justify-between p-3">
                <span>
                  {entry.studentName}{' '}
                  {entry.status && (
                    <span className="text-xs text-muted-foreground">({STATUS_LABEL[entry.status]})</span>
                  )}
                </span>
                <span className="flex gap-2">
                  {(['present', 'absent', 'late'] as const).map((status) => (
                    <Button
                      key={status}
                      variant={entry.status === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onMark(entry.studentId, status)}
                    >
                      {STATUS_LABEL[status]}
                    </Button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 4: Route page**

```tsx
// attendance-admin/src/app/(dashboard)/attendance/page.tsx
import type { Metadata } from 'next'
import { AttendanceScreen } from '@/features/attendance/components/attendance-screen'

export const metadata: Metadata = { title: 'Attendance — Attendance' }

export default function AttendancePage() {
  return <AttendanceScreen />
}
```

- [ ] **Step 5: Document the cross-slice exception**

In `attendance-admin/CLAUDE.md`, under "Dependency direction," add: `attendance` slice → imports `useClassrooms` from `classrooms` (classroom picker for the roster).

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors.

```bash
git add src/features/attendance src/app/\(dashboard\)/attendance CLAUDE.md
git commit -m "feat: teacher attendance marking screen"
```

---

## Task 11: Role-based dashboard nav (frontend)

Depends on Tasks 8–10 (all three route pages must exist). Rewrites the placeholder scaffold shell from the earlier scaffold phase into a real role-gated nav. **Files:**
- Modify: `attendance-admin/src/app/(dashboard)/layout.tsx`
- Modify: `attendance-admin/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Layout with role-based nav**

```tsx
// attendance-admin/src/app/(dashboard)/layout.tsx
import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser, logout } from '@/features/auth/actions'

const ADMIN_NAV = [
  { href: '/dashboard/classrooms', label: 'Classrooms' },
  { href: '/dashboard/students', label: 'Students' },
]
const TEACHER_NAV = [{ href: '/dashboard/attendance', label: 'Attendance' }]

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  const nav = user.role === 'admin' ? ADMIN_NAV : TEACHER_NAV

  return (
    <div className="min-h-svh flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Attendance</span>
          <nav className="flex gap-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground capitalize">{user.role}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
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

- [ ] **Step 2: Dashboard index becomes a role router**

```tsx
// attendance-admin/src/app/(dashboard)/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/features/auth/actions'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  redirect(user?.role === 'admin' ? '/dashboard/classrooms' : '/dashboard/attendance')
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 errors; build lists all 6 routes (`/`, `/login`, `/dashboard`, `/dashboard/classrooms`, `/dashboard/students`, `/dashboard/attendance`).

Manual end-to-end check (mirrors the scaffold-phase smoke test):
1. `docker compose up -d && npm run start:dev` in `attendance-api`, `npm run seed`.
2. `npm run dev` in `attendance-admin`.
3. Log in as `admin@attendance.dev` / `password123` → lands on `/dashboard/classrooms`, see "Grade 3A".
4. Log out, log in as `teacher@attendance.dev` / `password123` → lands on `/dashboard/attendance`, pick "Grade 3A", see Sokha/Dara, click "Mark all present", then mark one student "Absent" with a note — confirm the status updates and (per Task 6, once a parent is linked via Task 5's bot flow) a Telegram message arrives.

```bash
git add "src/app/(dashboard)/layout.tsx" "src/app/(dashboard)/dashboard"
git commit -m "feat: role-based dashboard nav"
```

