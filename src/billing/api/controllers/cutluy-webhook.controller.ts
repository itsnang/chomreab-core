import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentEntity } from '../../infrastructure/entities/payment.entity';
import { MarkInvoicePaidCommand } from '../../application/commands/mark-invoice-paid.command';

/** Delivery beyond this age is rejected outright, signature or not — the
 *  same window CutLuy's own docs recommend, to blunt a captured-and-replayed
 *  delivery rather than just a forged one. */
const MAX_CLOCK_SKEW_SECONDS = 300;

/** The only event that means money actually moved (CONTEXT.md's "Payment"
 *  entry) — `scanned` is a customer looking at the QR in their banking app,
 *  not a completed transfer, and fulfilling on it would let someone open
 *  the code without ever paying. */
const FULFILLING_EVENT = 'payment.completed';

/** CutLuy's own docs sign only `${t}.${rawBody}` — the `X-CutLuy-Event`
 *  header is not part of that signed material. Trusting the header alone
 *  would let a genuine, validly-signed `payment.scanned` (or expired/failed)
 *  delivery — real body, real signature, captured and replayed with just the
 *  header swapped — fulfil an Invoice that was never actually paid. `status`
 *  lives inside the signed body, so cross-checking it against the header
 *  closes that gap without depending on anything CutLuy doesn't sign. */
const PAID_STATUS = 'paid';

interface CutLuyWebhookPayload {
  id: string;
  status: string;
  reference_id?: string | null;
  metadata?: { invoiceId?: string } | null;
}

@ApiExcludeController()
@Controller('billing/cutluy')
export class CutLuyWebhookController {
  private readonly logger = new Logger(CutLuyWebhookController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
  ) {}

  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-cutluy-signature') signatureHeader: string | undefined,
    @Headers('x-cutluy-event') eventHeader: string | undefined,
  ): Promise<{ ok: true }> {
    const raw = request.rawBody;
    if (!raw || !signatureHeader) {
      throw new ForbiddenException();
    }

    this.verifySignature(raw, signatureHeader);

    const payload = JSON.parse(raw.toString('utf8')) as CutLuyWebhookPayload;

    // Both the event header AND the signed body's own status must agree the
    // payment completed — see the PAID_STATUS comment above for why the
    // header alone isn't enough. Anything else needs no action here, and
    // returning non-2xx for one would just cost CutLuy 8 retries chasing an
    // event we were never going to act on.
    if (eventHeader !== FULFILLING_EVENT || payload.status !== PAID_STATUS) {
      return { ok: true };
    }

    const invoiceId = payload.reference_id ?? payload.metadata?.invoiceId;
    if (!invoiceId) {
      // A structurally incomplete payload retries can't fix — set by
      // InitiateCutLuyCheckoutHandler on every payment it creates, so this
      // should never actually happen for a payment this app originated.
      this.logger.error(
        `CutLuy payment.completed webhook for ${payload.id} carries no reference_id or metadata.invoiceId — cannot identify which Invoice to settle`,
      );
      return { ok: true };
    }

    // Idempotency fast path: CutLuy can and will redeliver the same event.
    // The unique index on payments.cutluy_reference is the real backstop
    // for the race between this check and the write below; this check just
    // keeps the common case (an honest redelivery, not a true race) from
    // re-running the command at all.
    const alreadyProcessed = await this.paymentRepository.findOneBy({
      cutluyReference: payload.id,
    });
    if (alreadyProcessed) {
      return { ok: true };
    }

    try {
      await this.commandBus.execute(
        new MarkInvoicePaidCommand(
          invoiceId,
          payload.id,
          payload as unknown as Record<string, unknown>,
        ),
      );
    } catch (error) {
      // Only swallow this specific race: the idempotency check above lost
      // against a concurrent delivery of this exact same event, which the
      // other delivery has since resolved (a Payment with this
      // cutluyReference now exists). A bare `instanceof BadRequestException`
      // would also swallow a genuinely different rejection — e.g. this
      // command later gaining a new validation path — and report it to
      // CutLuy as handled when it was not; re-checking that a Payment
      // actually exists now is what tells the two cases apart.
      if (error instanceof BadRequestException) {
        const resolvedByRace = await this.paymentRepository.findOneBy({
          cutluyReference: payload.id,
        });
        if (resolvedByRace) {
          this.logger.warn(
            `MarkInvoicePaidCommand rejected webhook for invoice ${invoiceId} (payment ${payload.id}) — resolved by a concurrent delivery: ${error.message}`,
          );
        } else {
          throw error;
        }
      } else {
        // A real, plausibly-transient failure (DB connectivity, etc.) — let
        // it propagate so this responds non-2xx and CutLuy retries.
        throw error;
      }
    }

    return { ok: true };
  }

  private verifySignature(raw: Buffer, signatureHeader: string): void {
    // Trimmed on both sides of `=`, not just split: a header delivered as
    // `t=123, v1=abc` (a space after the comma, which is common formatting
    // for this kind of header) would otherwise leave the key as `" v1"` and
    // silently reject every legitimate delivery.
    const parts = Object.fromEntries(
      signatureHeader
        .split(',')
        .map(
          (part) => part.split('=').map((s) => s.trim()) as [string, string],
        ),
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) {
      throw new ForbiddenException();
    }

    const timestamp = Number(t);
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > MAX_CLOCK_SKEW_SECONDS
    ) {
      throw new ForbiddenException();
    }

    const secret = this.configService.getOrThrow<string>(
      'cutluy.webhookSecret',
    );
    // Signed over the raw bytes directly (Buffer.concat), not
    // `raw.toString('utf8')` re-encoded back into the HMAC input — a byte
    // sequence CutLuy signed that isn't valid UTF-8 would otherwise get
    // silently replaced with U+FFFD on decode, producing an HMAC input that
    // no longer matches what was actually signed and rejecting a genuine
    // delivery for reasons indistinguishable from a forged one.
    const expected = createHmac('sha256', secret)
      .update(Buffer.concat([Buffer.from(`${t}.`, 'utf8'), raw]))
      .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(v1);
    const isValid =
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer);
    if (!isValid) {
      throw new ForbiddenException();
    }
  }
}
