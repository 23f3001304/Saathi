import type {
  Clock,
  EventKind,
  EventSink,
  IdGenerator,
  NonceRegistry,
  ReasonCode,
  StoredEvent,
} from "@covenant/domain";
import { toIsoTimestamp } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import { negotiationPayload } from "./negotiation-record.js";
import {
  constraintTableOf,
  isConstraintViolation,
} from "./sql/constraint-error.js";
import type { Appender, ReservationWriter } from "./reservation-writer.js";
import type { SettlementInput, SettlementPorts } from "./settlement-types.js";
import { NonceAlreadyBurned, mandateDraftsOf } from "./settlement-types.js";

/** Which reason code a constraint violation on each table resolves to (§5.2). */
const CONSTRAINT_REASONS: Record<string, ReasonCode> = {
  stock_reservations: "STOCK_CONFLICT",
  nonces: "NONCE_BURNED",
};

/**
 * The commit phase of §8.3 and nothing else: stock claim, envelope reservation,
 * mandate rows, transaction row, nonce burn — all inside the caller's
 * `BEGIN IMMEDIATE`.
 *
 * It runs in a **savepoint**, so a `PRIMARY KEY` violation retracts every write
 * *and* every buffered SSE frame it produced, and the caller answers with the
 * reason code that constraint means. The unique constraint is the enforcement;
 * `NonceCheck` upstream only diagnosed.
 */
export class VerifyCartCommitter {
  constructor(
    private readonly ledger: LedgerTransaction,
    private readonly events: EventSink,
    private readonly nonces: NonceRegistry,
    private readonly ports: SettlementPorts,
    private readonly reservations: ReservationWriter,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** `null` when everything committed; a reason code when a constraint won. */
  settle(input: SettlementInput): ReasonCode | null {
    try {
      this.ledger.run("gateway.verify_cart.settle", () => this.writeAll(input));
      return null;
    } catch (error) {
      return this.reasonFor(error);
    }
  }

  private reasonFor(error: unknown): ReasonCode {
    const reason = isConstraintViolation(error)
      ? CONSTRAINT_REASONS[constraintTableOf(error)]
      : undefined;
    if (reason === undefined) {
      throw error;
    }
    return reason;
  }

  /**
   * `verdict.emitted` is written **inside** the savepoint and first, so the
   * ledger reads in causal order and a constraint that fires afterwards
   * retracts the approval rather than leaving it standing (§7.1).
   */
  private writeAll(input: SettlementInput): void {
    this.append(input, "verdict.emitted", {
      decision: input.result.decision,
      reason_code: input.result.reasonCode,
      verdicts: input.result.seals,
    });
    this.recordNegotiation(input);
    const append: Appender = (kind, payload) =>
      this.append(input, kind, payload);
    this.reservations.claimStock(input, append);
    this.reservations.reserveEnvelope(input, append);
    const issued = this.recordMandates(input);
    this.openTransaction(input, issued);
    this.burnNonce(input, issued);
  }

  /** Only where a declared band did something; see `negotiationPayload`. */
  private recordNegotiation(input: SettlementInput): void {
    const payload = negotiationPayload(input.context);
    if (payload !== null) {
      this.append(input, "negotiation.settled", payload);
    }
  }

  private recordMandates(input: SettlementInput): StoredEvent {
    const event = this.append(input, "mandate.issued", {
      mandate_id: input.mandate.jti,
      kind: "payment",
      decision: input.result.decision,
    });
    for (const draft of mandateDraftsOf(input, event.id)) {
      this.ports.mandates.upsert(draft);
    }
    return event;
  }

  private openTransaction(input: SettlementInput, issued: StoredEvent): void {
    const context = input.context;
    const held = input.result.decision === "hold";
    this.append(input, held ? "cooloff.parked" : "txn.opened", {
      txn_id: context.txnId,
      hold_id: context.cart.jti,
      cooloff_until: input.holdUntil,
    });
    this.ports.transactions.open({
      id: context.txnId,
      tenantId: context.tenantId,
      userId: context.userId,
      cartMandateId: context.cart.jti,
      paymentMandateId: input.mandate.jti,
      amountPaise: context.cartTotal.paise,
      currency: context.cartTotal.currency,
      state: held ? "pending_cooloff" : "approved",
      cooloffUntil: input.holdUntil,
      lastEventSeq: issued.seq,
    });
  }

  /**
   * The burn is a consequence of approval, never of presentation: a rejected
   * cart never reaches this method, so a hostile merchant cannot permanently
   * kill a legitimate cart by making one check fail (§8.3).
   */
  private burnNonce(input: SettlementInput, issued: StoredEvent): void {
    const context = input.context;
    const event = this.append(input, "nonce.burned", {
      nonce: context.cart.jti,
      purpose: "cart_verify",
      mandate_event_id: issued.id,
    });
    const outcome = this.nonces.burn({
      nonce: context.cart.jti,
      purpose: "cart_verify",
      tenantId: context.tenantId,
      payloadHash: context.payloadHash,
      idempotencyKey: context.idempotencyKey,
      burnedAt: toIsoTimestamp(this.clock.now()),
      burnEventId: event.id,
      responseJson: input.responseJson,
    });
    if (outcome.status !== "burned") {
      throw new NonceAlreadyBurned();
    }
  }

  private append(
    input: SettlementInput,
    kind: EventKind,
    payload: Record<string, unknown>,
  ): StoredEvent {
    return this.events.append({
      tenant_id: input.context.tenantId,
      actor: "gateway",
      kind,
      txn_id: input.context.txnId,
      request_id: input.context.requestId,
      mandate_id: input.context.cart.jti,
      payload,
    });
  }
}
