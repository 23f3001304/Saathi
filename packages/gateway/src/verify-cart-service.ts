import type {
  IdGenerator,
  IdempotencyToPass,
  Sha256Hex,
  Tracer,
} from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";
import type { MandateChainVerifier, VerifiedChain } from "@covenant/mandates";

import type { IdempotencyResolver } from "./idempotency-resolver.js";
import { replayOf } from "./idempotent-replay.js";
import type { PaymentMandateFactory, SignedPaymentMandate } from "./payment-mandate-factory.js";
import type { RiskAttestationVerifier } from "./risk-attestation-verifier.js";
import type {
  VerifyCartRequest,
  VerifyCartResponse,
} from "./schemas/money-routes.js";
import type { ContextRequest } from "./verdict-context-builder.js";
import type { VerdictPipeline } from "./verdict-pipeline.js";
import type { VerifyCartCommitter } from "./verify-cart-committer.js";
import { holdUntilOf } from "./verify-cart-rejection.js";
import type { VerifyCartRejector } from "./verify-cart-rejector.js";
import { verifyCartBodyOf } from "./verify-cart-response.js";

export interface VerifyCartCommand {
  readonly body: VerifyCartRequest;
  readonly tenantId: string;
  readonly userId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: Sha256Hex;
}

export type VerifyCartOutcome =
  | {
      readonly status: "verdict";
      readonly body: VerifyCartResponse;
      readonly replay: boolean;
    }
  | { readonly status: "conflict"; readonly toPass: IdempotencyToPass };

/**
 * `POST /verify-cart`: admission → context → engine → decision → burn + issue,
 * as **one** `BEGIN IMMEDIATE` envelope (§5.1).
 *
 * DECISION: the pipeline is evaluated once on the read snapshot immediately
 * before the transaction, the Payment Mandate is signed from those seals, and
 * the transaction re-evaluates and commits only if the seals still agree. Why:
 * signing is `async`, a transaction may contain no `await` (§5.3), and §5.2 a
 * requires burn and mandate issue to be one atomic unit. Signing first
 * satisfies both — "if issuance fails the burn never happens" because the
 * transaction never opens, and "a burn cannot exist without its mandate"
 * because the row and the burn share the savepoint. A seal disagreement (only
 * reachable when another request commits during the signature) commits nothing
 * and answers with the fresh verdicts, which is the fail-closed side.
 */
export class VerifyCartService {
  constructor(
    private readonly chain: MandateChainVerifier,
    private readonly idempotency: IdempotencyResolver,
    private readonly risk: RiskAttestationVerifier,
    private readonly pipeline: VerdictPipeline,
    private readonly mandates: PaymentMandateFactory,
    private readonly committer: VerifyCartCommitter,
    private readonly rejector: VerifyCartRejector,
    private readonly ledger: LedgerTransaction,
    private readonly ids: IdGenerator,
    private readonly tracer: Tracer,
  ) {}

  async verify(command: VerifyCartCommand): Promise<VerifyCartOutcome> {
    const span = this.tracer.startSpan("gateway.verify_cart", {
      tenant: command.tenantId,
    });
    try {
      return await this.run(command);
    } finally {
      span.end();
    }
  }

  private async run(command: VerifyCartCommand): Promise<VerifyCartOutcome> {
    const verified = await this.chain.verifyChain({
      intentJwt: command.body.intent_mandate_jwt,
      cartJwt: command.body.cart_mandate_jwt,
    });
    if (verified.status === "rejected") {
      return this.rejected(
        this.rejector.stageZero(command, verified.reasonCode, verified.toPass),
      );
    }
    const replayed = replayOf<VerifyCartResponse>(this.idempotency, {
      nonce: verified.value.cart.jti,
      purpose: "cart_verify",
      tenantId: command.tenantId,
      idempotencyKey: command.idempotencyKey,
      payloadHash: command.payloadHash,
    });
    // A burned nonce still runs the pipeline, so `NonceCheck` stamps its seal
    // and the caller sees which of the eight broke (§4.5 row 4).
    if (replayed !== null && replayed.status !== "burned") {
      return replayed.status === "replay"
        ? { status: "verdict", body: replayed.body, replay: true }
        : { status: "conflict", toPass: replayed.toPass };
    }
    return this.evaluate(command, verified.value);
  }

  private async evaluate(
    command: VerifyCartCommand,
    chain: VerifiedChain,
  ): Promise<VerifyCartOutcome> {
    const request: ContextRequest = {
      intent: chain.intent,
      cart: chain.cart,
      cartJwt: command.body.cart_mandate_jwt,
      riskAttestation: await this.risk.factsFor(chain.cart.risk_data),
      tenantId: command.tenantId,
      userId: command.userId,
      requestId: command.requestId,
      txnId: `txn_${this.ids.uuid()}`,
      payloadHash: command.payloadHash,
      idempotencyKey: command.idempotencyKey,
    };
    const pre = this.pipeline.evaluate(request);
    const mandate =
      pre.result.decision === "reject"
        ? null
        : await this.mandates.issue(pre, holdUntilOf(pre));
    return this.ledger.run("gateway.verify_cart", () =>
      this.commit(command, request, mandate),
    );
  }

  private commit(
    command: VerifyCartCommand,
    request: ContextRequest,
    mandate: SignedPaymentMandate | null,
  ): VerifyCartOutcome {
    const run = this.pipeline.evaluate(request);
    if (
      mandate === null ||
      run.result.decision === "reject" ||
      !mandate.sealsMatch(run.result.seals)
    ) {
      return this.rejected(this.rejector.fromPipeline(run, null));
    }
    const holdUntil = holdUntilOf(run);
    const body = verifyCartBodyOf({
      txnId: run.context.txnId,
      verdicts: run.verdicts,
      result: run.result,
      mandate,
      holdUntil,
    });
    const conflict = this.committer.settle({
      context: run.context,
      verdicts: run.verdicts,
      result: run.result,
      mandate,
      intentJwt: command.body.intent_mandate_jwt,
      cartJwt: command.body.cart_mandate_jwt,
      holdUntil,
      responseJson: JSON.stringify(body),
    });
    return conflict === null
      ? { status: "verdict", body, replay: false }
      : this.rejected(this.rejector.fromPipeline(run, conflict));
  }

  private rejected(body: VerifyCartResponse): VerifyCartOutcome {
    return { status: "verdict", body, replay: false };
  }
}
