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

  /** A single Telegram chat may hold links into more than one School — a
   *  parent with children at two institutions is ordinary here, not an edge
   *  case — so this scopes one link, never the whole chat. */
  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column()
  telegramChatId: string;

  @CreateDateColumn()
  linkedAt: Date;
}
