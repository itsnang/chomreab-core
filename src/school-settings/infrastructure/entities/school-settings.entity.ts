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
