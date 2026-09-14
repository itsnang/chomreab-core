import { randomBytes } from 'crypto';

/** A 12-character url-safe password, generated when an admin creates a teacher
 *  account or resets one. It is shown to the admin exactly once and the account
 *  is flagged `mustChangePassword` until the teacher replaces it. */
export function generateTempPassword(): string {
  return randomBytes(9).toString('base64url');
}
