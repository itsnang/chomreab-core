import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  tokenHash: string;

  @Column('uuid')
  userId: string;

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
