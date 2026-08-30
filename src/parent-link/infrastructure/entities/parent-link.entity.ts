import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('parent_links')
@Index(['studentId', 'telegramChatId'], { unique: true })
export class ParentLinkEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column()
  telegramChatId: string;

  @CreateDateColumn()
  linkedAt: Date;
}
