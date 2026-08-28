import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('parent_links')
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
