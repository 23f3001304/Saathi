import type { Clock, IdGenerator, VerdictSeal } from "@covenant/domain";
import { merchantIdOf, toSha256Ref } from "@covenant/domain";
import type { PaymentMandateIssuer } from "@covenant/mandates";

import type { PipelineRun } from "./verdict-pipeline.js";
import type { IssuedPaymentMandate } from "./verify-cart-response.js";

export interface PaymentMandateConfig {
  readonly ttlSeconds: number;
  /** Delay before `execute_not_before`; a hold overrides it with its maturity. */
  readonly executeDelaySeconds: number;
}

export interface SignedPaymentMandate extends IssuedPaymentMandate {
  /** The seals the credential was signed over, for the commit-phase re-check. */
  sealsMatch(seals: readonly VerdictSeal[]): boolean;
}

/**
 * Issues the §6.4 Payment Mandate from a pipeline run. It is signed **before**
 * the write transaction opens, because signing is async and a transaction may
 * contain no `await` (§5.3); the credential is a pure artifact until a row
 * references it, so an unused one is simply discarded.
 */
export class PaymentMandateFactory {
  constructor(
    private readonly issuer: PaymentMandateIssuer,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: PaymentMandateConfig,
  ) {}

  async issue(
    run: PipelineRun,
    executeNotBefore: string | null,
  ): Promise<SignedPaymentMandate> {
    const context = run.context;
    const seals = run.result.seals;
    const draft = await this.issuer.issueDraft({
      userSub: context.intent.sub,
      tenantId: context.tenantId,
      paymentId: `urn:covenant:payment:${this.ids.uuid()}`,
      cartJti: context.cart.jti,
      cartJwtHash: context.cart.jwtHash,
      intentMandateHash: toSha256Ref(context.intent.jwtHash),
      memoryDigest: context.cart.memory_digest,
      amount: context.cartTotal.paise,
      currency: context.cartTotal.currency,
      merchantId: merchantIdOf(context.cart),
      paymentToken: `pt_${this.ids.uuid()}`,
      agentInstanceId: context.cart.agent_instance_id,
      verdicts: seals,
      executeNotBefore: executeNotBefore ?? this.notBefore(),
      envelopeReservationId: context.txnId,
      ttlSeconds: this.config.ttlSeconds,
      issuedAt: this.clock.now(),
      jti: null,
    });
    return {
      jwt: draft.jwt,
      jti: draft.jti,
      jwtHash: draft.jwtHash,
      awaitingUserAuthorization: context.intent.user_cart_confirmation_required,
      sealsMatch: (current) => sealsEqual(seals, current),
    };
  }

  private notBefore(): string {
    return new Date(
      this.clock.now().getTime() + this.config.executeDelaySeconds * 1000,
    ).toISOString();
  }
}

/**
 * The seals inside the credential must be the seals the transaction commits, or
 * the signature attests to a verdict nobody reached.
 */
function sealsEqual(
  left: readonly VerdictSeal[],
  right: readonly VerdictSeal[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (seal, index) =>
        seal.check === right[index]?.check &&
        seal.outcome === right[index]?.outcome,
    )
  );
}
