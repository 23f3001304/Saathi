import type { Logger } from "@covenant/domain";

import type { GatewayClient, GatewayFailure } from "./gateway-client.js";
import type { VerifyCartResponse } from "./gateway-schemas.js";
import type { CorrectionPlan, SelfCorrector } from "./self-correction.js";

export interface CheckoutRequest {
  readonly cartMandateJwt: string;
  readonly intentMandateJwt: string;
  readonly memoryEntryIds: readonly string[];
}

export type CheckoutOutcome =
  | {
      readonly kind: "paid";
      readonly txnId: string;
      readonly rzpOrderId: string;
      /** `null` when the rail refused a link; the order is still payable. */
      readonly paymentLink: string | null;
    }
  | {
      readonly kind: "held";
      readonly txnId: string;
      readonly holdId: string;
      readonly until: string;
      readonly cancelUrl: string;
    }
  | {
      readonly kind: "awaiting_user";
      readonly txnId: string;
      readonly draft: string;
    }
  | {
      readonly kind: "rejected";
      readonly txnId: string;
      readonly plan: CorrectionPlan;
    }
  | { readonly kind: "failed"; readonly plan: CorrectionPlan };

function failed(
  failure: GatewayFailure,
  plan: CorrectionPlan,
): CheckoutOutcome {
  return { kind: "failed", plan: { ...plan, reasonCode: failure.reasonCode } };
}

/**
 * verify-cart → (confirm) → execute-payment, with the rejection path treated
 * as a first-class outcome rather than an exception. A 200 that says `reject`
 * is the gateway working; the agent reads `to_pass`, learns what would pass,
 * and hands that to the caller instead of retrying blind.
 */
export class Checkout {
  constructor(
    private readonly gateway: GatewayClient,
    private readonly corrector: SelfCorrector,
    private readonly logger: Logger,
  ) {}

  async run(request: CheckoutRequest): Promise<CheckoutOutcome> {
    const verified = await this.gateway.verifyCart({
      cart_mandate_jwt: request.cartMandateJwt,
      intent_mandate_jwt: request.intentMandateJwt,
      memory_entry_ids: [...request.memoryEntryIds],
    });
    if (!verified.ok) {
      const { failure } = verified;
      this.logger.warn("gateway.verify_cart.failed", {
        reason_code: failure.reasonCode,
        kind: failure.kind,
      });
      return failed(
        failure,
        this.corrector.plan({
          reasonCode: failure.reasonCode,
          human: failure.human,
          toPass: failure.toPass,
        }),
      );
    }
    return this.onVerdict(verified.value);
  }

  private onVerdict(body: VerifyCartResponse): Promise<CheckoutOutcome> {
    if (body.decision === "reject") {
      return Promise.resolve(this.rejected(body));
    }
    if (body.hold !== null) {
      return Promise.resolve({
        kind: "held",
        txnId: body.txn_id,
        holdId: body.hold.hold_id,
        until: body.hold.until,
        cancelUrl: body.hold.cancel_url,
      });
    }
    // §6.5: a draft outstanding means the user's authorization is still owed,
    // even when the gateway has already issued the mandate alongside it.
    if (body.payment_mandate_draft !== null) {
      return Promise.resolve({
        kind: "awaiting_user",
        txnId: body.txn_id,
        draft: body.payment_mandate_draft,
      });
    }
    return this.execute(body);
  }

  private rejected(body: VerifyCartResponse): CheckoutOutcome {
    const plan = this.corrector.plan({
      reasonCode: body.reason_code ?? "SCHEMA_VIOLATION",
      human: body.human,
      toPass: body.to_pass,
    });
    this.logger.warn("gateway.verdict.rejected", {
      txn_id: body.txn_id,
      reason_code: plan.reasonCode,
      action: plan.action,
    });
    return { kind: "rejected", txnId: body.txn_id, plan };
  }

  private async execute(body: VerifyCartResponse): Promise<CheckoutOutcome> {
    const jwt = body.payment_mandate_jwt;
    if (jwt === null) {
      return {
        kind: "failed",
        plan: this.corrector.plan({
          reasonCode: "MANDATE_MALFORMED",
          human: "The gateway approved without issuing a Payment Mandate.",
          toPass: null,
        }),
      };
    }
    const paid = await this.gateway.executePayment({
      payment_mandate_jwt: jwt,
    });
    if (!paid.ok) {
      return failed(
        paid.failure,
        this.corrector.plan({
          reasonCode: paid.failure.reasonCode,
          human: paid.failure.human,
          toPass: paid.failure.toPass,
        }),
      );
    }
    return {
      kind: "paid",
      txnId: paid.value.txn_id,
      rzpOrderId: paid.value.rzp_order_id,
      paymentLink: paid.value.payment_link,
    };
  }
}
