import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Someone who runs Chomreab itself, across every School — see CONTEXT.md's
 * "Operator" entry. Deliberately its own table, not a role value on
 * `UserEntity`: every `UserEntity` row is scoped to exactly one School, and
 * an Operator belongs to none. Keeping them apart means a School-scoped
 * query can never accidentally include a row with no `schoolId` at all —
 * see ADR-0009.
 */
@Entity('operators')
export class OperatorEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
