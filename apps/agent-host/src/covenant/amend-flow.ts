import type { GatewayClient } from "@covenant/agents";
import type {
  Clock,
  IntentBounds,
  IsoTimestamp,
  Logger,
} from "@covenant/domain";
import type { IntentMandateIssuer } from "@covenant/mandates";

import type { CovenantEdits } from "./amend-bounds.js";
import { applyEdits } from "./amend-bounds.js";
import { baseBounds, readCurrent } from "./current-bounds.js";

/**
 * A standing covenant outlives a purchase. Constraints are written with
 * `tInvalid: intent_expiry`, so the purchase path's one-day TTL would quietly
 * expire the shopper's rules overnight — they would seal them, see them, and
 * find them gone. Thirty days, and `intent_expiry` is itself editable, so a
 * shopper who wants a shorter leash can say so and sign that.
 */
const STANDING_TTL_SECONDS = 30 * 86_400;

export interface AmendConfig {
  readonly gatewayUrl: string;
  readonly apiVersion: string;
  readonly tenantId: string;
  readonly userIss: string;
  readonly agentInstanceId: string;
  readonly currency: string;
}

export interface AmendResult {
  readonly mandateId: string;
  readonly constraintIds: readonly string[];
  /**
   * Edits the write gate would not take — a cool-off shortened, a ceiling
   * raised, anything R1–R5 reads as widening a bound it is not entitled to
   * widen. Reported by predicate, because a seal that quietly drops one of the
   * changes it was given is the exact failure this route was added to end.
   */
  readonly refused: readonly string[];
}

export class AmendRejected extends Error {
  constructor(
    readonly reasonCode: string,
    human: string,
  ) {
    super(human);
    this.name = "AmendRejected";
  }
}

/**
 * The Rules screen's seal, taken the whole way to the ledger.
 *
 * DECISION: this goes through `POST /v1/covenant/sign` like a purchase does,
 * with no shortcut of its own. A rule the shopper typed and a ceiling a
 * purchase drafted are the same kind of object — a bound the user signed — and
 * §9.2's "the only way a constraint can be created" is worth keeping literally
 * true rather than nearly true.
 *
 * DECISION: the client sends the *edits* it displayed, never the resulting
 * bound set. The host reads what is in force and overlays them itself, so a
 * tampered page cannot hand the user's own key a covenant to sign that nobody
 * was shown.
 */
export class AmendFlow {
  constructor(
    private readonly issuer: IntentMandateIssuer,
    private readonly gateway: GatewayClient,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: AmendConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async seal(edits: CovenantEdits, description: string): Promise<AmendResult> {
    const bounds = await this.next(edits);
    const mandate = await this.issuer.issue({
      userIss: this.config.userIss,
      tenantId: this.config.tenantId,
      naturalLanguageDescription: description,
      agentInstanceId: this.config.agentInstanceId,
      bounds,
      ttlSeconds: STANDING_TTL_SECONDS,
      issuedAt: this.clock.now(),
      jti: null,
    });
    const signed = await this.gateway.signCovenant({
      intent_mandate_jwt: mandate.jwt,
    });
    if (!signed.ok) {
      this.logger.error("covenant.amend.failed", {
        reason_code: signed.failure.reasonCode,
      });
      throw new AmendRejected(signed.failure.reasonCode, signed.failure.human);
    }
    const refused = await this.refusedAmong(edits);
    this.logger.info("covenant.amended", {
      mandate_id: signed.value.mandate_id,
      constraints: signed.value.committed_constraints.length,
      refused: refused.join(","),
    });
    return {
      mandateId: signed.value.mandate_id,
      constraintIds: signed.value.committed_constraints,
      refused,
    };
  }

  /**
   * What the ledger says, not what we asked it for. The gateway answers with
   * committed ids and no predicates, and the write gate can refuse one bound
   * of fifteen — so the only honest way to report a seal is to read the
   * covenant back and see which edits are actually in force.
   */
  private async refusedAmong(edits: CovenantEdits): Promise<readonly string[]> {
    const after = await this.read();
    const held = new Map(
      after.bounds.map((edit) => [edit.predicate, String(edit.value)]),
    );
    return edits.bounds
      .filter((edit) => held.get(edit.predicate) !== String(edit.value))
      .map((edit) => edit.predicate);
  }

  private read(): Promise<CovenantEdits> {
    return readCurrent(
      this.config.gatewayUrl,
      this.config.apiVersion,
      this.fetchImpl,
    );
  }

  private async next(edits: CovenantEdits): Promise<IntentBounds> {
    const held = await this.read();
    const start = baseBounds(this.expiry(), this.config.currency);
    // The expiry in force belongs to whatever was signed last, and the last
    // thing signed is usually a purchase with a one-day life. Carrying it into
    // a standing rule would expire the shopper's covenant overnight, so the
    // horizon comes from this seal — unless the shopper edited it, and that
    // arrives in `edits` and lands after.
    const carried = {
      ...held,
      bounds: held.bounds.filter((e) => e.predicate !== "intent_expiry"),
    };
    return applyEdits(applyEdits(start, carried), edits);
  }

  private expiry(): IsoTimestamp {
    const ms = this.clock.now().getTime() + STANDING_TTL_SECONDS * 1000;
    return new Date(ms).toISOString() as IsoTimestamp;
  }
}
