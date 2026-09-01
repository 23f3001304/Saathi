import type { IdGenerator, ReasonCode, ToPass } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { IdempotencyResolver } from "./idempotency-resolver.js";
import type { VerifyCartResponse } from "./schemas/money-routes.js";
import type { VerdictLedger } from "./verdict-ledger.js";
import { overrideVerdict } from "./verdict-override.js";
import type { PipelineRun, VerdictPipeline } from "./verdict-pipeline.js";
import { zeroSealBodyOf } from "./verify-cart-rejection.js";
import { verifyCartBodyOf } from "./verify-cart-response.js";

export interface StageZeroCommand {
  readonly tenantId: string;
  readonly requestId: string;
}

/**
 * Every path that answers "no" on `/verify-cart`, in one place, because they
 * must all leave the same shaped trail: a 200 verdict body for the caller and a
 * `verdict.emitted` (plus `attack.detected` where the seal alone would not show
 * it) for the ledger. A rejected cart **never** burns its nonce (§8.3) — the
 * burn is a consequence of approval, not of presentation — so nothing here
 * writes to `nonces`.
 */
export class VerifyCartRejector {
  constructor(
    private readonly pipeline: VerdictPipeline,
    private readonly verdicts: VerdictLedger,
    private readonly idempotency: IdempotencyResolver,
    private readonly ledger: LedgerTransaction,
    private readonly ids: IdGenerator,
  ) {}

  /** `conflict` rewrites the seal the commit-phase constraint actually owns. */
  fromPipeline(
    run: PipelineRun,
    conflict: ReasonCode | null,
  ): VerifyCartResponse {
    const verdicts =
      conflict === null
        ? run.verdicts
        : overrideVerdict(
            run.verdicts,
            conflict,
            run.context,
            this.idempotency.peek(run.context.cart.jti, "cart_verify"),
          );
    const result = this.pipeline.decide(verdicts);
    this.verdicts.emit({
      tenantId: run.context.tenantId,
      txnId: run.context.txnId,
      requestId: run.context.requestId,
      mandateId: run.context.cart.jti,
      verdicts,
      decision: result.decision,
      reasonCode: result.reasonCode,
      toPass: result.toPass,
    });
    return verifyCartBodyOf({
      txnId: run.context.txnId,
      verdicts,
      result,
      mandate: null,
      holdUntil: null,
    });
  }

  /**
   * Stage 0 rejected the credential itself, so the pipeline never ran and the
   * body carries zero seals (§8.1). The block is still ledgered: an attack the
   * audit trail cannot see is an attack nobody can prove was stopped.
   */
  stageZero(
    command: StageZeroCommand,
    reasonCode: ReasonCode,
    toPass: ToPass | null,
  ): VerifyCartResponse {
    const txnId = `txn_${this.ids.uuid()}`;
    return this.ledger.run("gateway.verify_cart.stage_zero", () => {
      this.verdicts.emit({
        tenantId: command.tenantId,
        txnId,
        requestId: command.requestId,
        mandateId: null,
        verdicts: [],
        decision: "reject",
        reasonCode,
        toPass,
      });
      return zeroSealBodyOf({ txnId, reasonCode, toPass });
    });
  }
}
