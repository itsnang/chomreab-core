export class InitiateCutLuyCheckoutCommand {
  constructor(
    public readonly schoolId: string,
    public readonly invoiceId: string,
  ) {}
}
