export class MarkInvoicePaidCommand {
  constructor(
    public readonly invoiceId: string,
    /** Null for the manual path this phase tests against; Phase 3's CutLuy
     *  webhook supplies its own reference here as the idempotency key. */
    public readonly cutluyReference: string | null = null,
    public readonly rawWebhookPayload: Record<string, unknown> | null = null,
  ) {}
}
