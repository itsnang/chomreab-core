import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('password_reset_tokens')
export class PasswordResetTokenEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column()
  tokenHash: string;

  @Column('uuid')
  userId: string;

  @Column()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
