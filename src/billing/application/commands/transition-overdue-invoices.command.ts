/**
 * Carries `now` explicitly so the state machine can be driven by a fixed
 * clock in tests instead of real elapsed time — see the plan's Phase 2
 * verification note. The `@Cron` job that fires this in production passes
 * `new Date()`.
 */
export class TransitionOverdueInvoicesCommand {
  constructor(public readonly now: Date = new Date()) {}
}
