/** Same fixed-clock shape as TransitionOverdueInvoicesCommand, and driven by
 *  the same daily cron — see billing.module.ts. */
export class GenerateRenewalInvoicesCommand {
  constructor(public readonly now: Date = new Date()) {}
}
