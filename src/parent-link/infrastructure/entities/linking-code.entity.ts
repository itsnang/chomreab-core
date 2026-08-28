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
