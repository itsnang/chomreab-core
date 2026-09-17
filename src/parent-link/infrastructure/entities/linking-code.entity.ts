import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('linking_codes')
export class LinkingCodeEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  studentId: string;

  /** Globally unique on purpose, not scoped to `(schoolId, code)`: a parent's
   *  `/link CODE` carries no school identifier, and with one shared Telegram
   *  bot there is no per-request "current school" to resolve it against.
   *  `link-parent.handler.ts`'s unscoped lookup by this column alone is how
   *  the school is discovered in the first place — see ADR-0007 and the note
   *  on that handler. Do not narrow this to a composite unique constraint. */
  @Column({ unique: true })
  code: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
