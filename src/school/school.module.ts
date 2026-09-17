import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolEntity } from './infrastructure/entities/school.entity';

/**
 * Registers `SchoolEntity` with TypeORM so `synchronize` creates its table —
 * `autoLoadEntities` only picks up entities reachable through a module's
 * `forFeature()`, not every `@Entity()` file on disk.
 *
 * Empty otherwise: the signup command/handler that actually creates a School
 * is Phase 1. This module exists now so the schema is complete and every
 * other table's `schoolId` foreign key points at something real.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SchoolEntity])],
  exports: [TypeOrmModule],
})
export class SchoolModule {}
