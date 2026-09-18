import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperatorEntity } from './infrastructure/entities/operator.entity';

/**
 * Registers `OperatorEntity` with TypeORM so `synchronize` creates its
 * table. Empty otherwise: the login endpoint and the env-seeded bootstrap
 * account (mirroring `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) are not built
 * yet — `OperatorJwtAuthGuard` exists (src/shared/guards) but nothing issues
 * an Operator token until there's a screen for it to protect.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OperatorEntity])],
  exports: [TypeOrmModule],
})
export class OperatorModule {}
