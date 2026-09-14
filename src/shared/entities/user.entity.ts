import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
}

@Entity('users')
export class UserEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
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
