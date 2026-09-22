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

/** A real delivery's `data.payment.status`, not merely its `type`, is what
 *  proves money moved — matches `FULFILLING_EVENT` below. Both live inside
 *  the signed body (`${t}.${rawBody}`), so cross-checking one against the
 *  other closes a captured-and-replay gap without depending on anything
 *  CutLuy doesn't sign (unlike the `X-CutLuy-Event` header, which is not
 *  covered by the signature and is not trusted here at all). */
const PAID_STATUS = 'paid';

/** CutLuy wraps every delivery in an event envelope — `id`/`type` describe
 *  the event itself, the actual Payment lives nested under `data.payment`.
 *  Confirmed against a real CutLuy test delivery on 2026-09-21: the payload
 *  is NOT the flat `{id, status, reference_id, metadata}` shape the original
 *  integration docs described — `payload.status` doesn't exist at the root,
 *  so that flat parsing silently treated every delivery as unfulfillable and
 *  never once called MarkInvoicePaidCommand. */
interface CutLuyWebhookEnvelope {
  id: string;
  type: string;
  data: {
    payment: {
      id: string;
      status: string;
      reference_id?: string | null;
      metadata?: { invoiceId?: string } | null;
    };
  };
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
  ): Promise<{ ok: true }> {
    const raw = request.rawBody;
    if (!raw || !signatureHeader) {
      throw new ForbiddenException();
    }

    this.verifySignature(raw, signatureHeader);

    const envelope = JSON.parse(raw.toString('utf8')) as CutLuyWebhookEnvelope;
    const payment = envelope.data.payment;

    // Both the envelope's own `type` and the nested Payment's `status` must
    // agree the payment completed — see PAID_STATUS above for why. Anything
    // else needs no action here, and returning non-2xx for one would just
    // cost CutLuy 8 retries chasing an event we were never going to act on.
    if (envelope.type !== FULFILLING_EVENT || payment.status !== PAID_STATUS) {
      return { ok: true };
    }

    const invoiceId = payment.reference_id ?? payment.metadata?.invoiceId;
    if (!invoiceId) {
      // A structurally incomplete payload retries can't fix — set by
      // InitiateCutLuyCheckoutHandler on every payment it creates, so this
      // should never actually happen for a payment this app originated.
      this.logger.error(
        `CutLuy payment.completed webhook for ${payment.id} carries no reference_id or metadata.invoiceId — cannot identify which Invoice to settle`,
      );
      return { ok: true };
    }

    // Idempotency fast path: CutLuy can and will redeliver the same event.
    // The unique index on payments.cutluy_reference is the real backstop
    // for the race between this check and the write below; this check just
    // keeps the common case (an honest redelivery, not a true race) from
    // re-running the command at all.
    //
    // Unscoped: cutluyReference carries a *global* unique index (see
    // payment.entity.ts), and there's no schoolId in hand yet without an
    // extra Invoice fetch this check doesn't otherwise need — structurally
    // moot to scope further, the same reasoning docs/adr/0010's "keyed by a
    // globally-unique primary key" category applies to a unique secondary
    // key here, not just a PK.
    // eslint-disable-next-line local/require-scoped-repository
    const alreadyProcessed = await this.paymentRepository.findOneBy({
      cutluyReference: payment.id,
    });
    if (alreadyProcessed) {
      return { ok: true };
    }

    try {
      await this.commandBus.execute(
        new MarkInvoicePaidCommand(
          invoiceId,
          payment.id,
          envelope as unknown as Record<string, unknown>,
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
        // Same globally-unique-column reasoning as the idempotency check
        // above.
        // eslint-disable-next-line local/require-scoped-repository
        const resolvedByRace = await this.paymentRepository.findOneBy({
          cutluyReference: payment.id,
        });
        if (resolvedByRace) {
          this.logger.warn(
            `MarkInvoicePaidCommand rejected webhook for invoice ${invoiceId} (payment ${payment.id}) — resolved by a concurrent delivery: ${error.message}`,
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
