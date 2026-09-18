import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const DEFAULT_SCHOOL_SETTINGS = {
  schoolName: 'My School',
  lateCutoffMinutes: 15,
  absenceMessageTemplate:
    '{{student_name}} was marked absent today with no note on file.',
};

/** One row per School, keyed directly by `schoolId` rather than a separate
 *  generated `id` — the relationship is exactly 1:1 forever, and nothing
 *  addresses a settings row from any other context, so a second identity
 *  would only be a redundant index. This replaces the single-tenant era's
 *  hardcoded singleton row (`id = 'default'`).
 *
 *  Carries no Telegram fields: every School shares one bot (ADR-0007), so the
 *  token and username are deployment config (`configuration.ts`), never
 *  per-school data. */
@Entity('school_settings')
export class SchoolSettingsEntity {
  @PrimaryColumn({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'varchar' })
  schoolName: string;

  @Column({ type: 'int' })
  lateCutoffMinutes: number;

  @Column({ type: 'text' })
  absenceMessageTemplate: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
