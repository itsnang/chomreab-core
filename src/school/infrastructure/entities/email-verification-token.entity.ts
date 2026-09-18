import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Gates a School's trial — see CONTEXT.md's "Trial" entry: usable only once
 * verified. Shape mirrors `PasswordResetTokenEntity` (short-lived,
 * single-use, hashed at rest) rather than sharing a table with it: a
 * password-reset token authenticates an existing user, this one activates a
 * School that cannot sign in yet, and conflating the two would let a bug in
 * one flow's expiry/reuse logic silently affect the other.
 */
@Entity('email_verification_tokens')
export class EmailVerificationTokenEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @Column()
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
