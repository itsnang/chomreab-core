import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * The tenant boundary — see CONTEXT.md's "School" entry. One row per school
 * or tutoring centre; every other table's `schoolId` points here.
 */
@Entity('schools')
export class SchoolEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Set once, at signup, and never moved: a School that converts to a paid
   *  Subscription still keeps its original trial window on record. Trial
   *  status is read by comparing this to now, not by a separate boolean —
   *  see CONTEXT.md's "Trial" entry for why it isn't a Subscription state. */
  @Column({ type: 'timestamptz' })
  trialEndsAt: Date;

  /** Null until the founding admin confirms their email. A School with no
   *  verified email cannot be signed into — see the signup flow (Phase 1). */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
