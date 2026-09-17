import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
}

/** Email is unique per School, not globally — the same address may be an
 *  admin at one School and a teacher at another, each a separate account.
 *  See CONTEXT.md's "Admin"/"Teacher" entries: one School per user, no
 *  cross-school membership. */
@Entity('users')
@Index(['schoolId', 'email'], { unique: true })
export class UserEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  /** Set when an admin creates the account with a generated temporary
   *  password. The client keeps the user out of the app until they replace it. */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
