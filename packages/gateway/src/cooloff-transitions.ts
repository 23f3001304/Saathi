import type {
  Clock,
  EventKind,
  EventSink,
  IsoTimestamp,
  Transaction,
} from "@covenant/domain";
import { CANCEL_RESTORE_SECONDS, toIsoTimestamp } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { EnvelopeReservationManager } from "./sql/envelope-reservations.js";
import type { TransactionStore } from "./sql/transaction-store.js";

export interface CooloffMove {
  readonly won: boolean;
  readonly state: Transaction["state"];
  readonly restoreDeadline: IsoTimestamp | null;
}

/**
 * The cool-off state machine, in both directions, as **guarded** `UPDATE`s
 * (§5.2 e). Exactly one of maturity and cancel returns `changes() === 1`; the
 * loser appends `cooloff.race.lost` and is told the truth — the cancel window
 * closes at maturity, not at capture, and answering a late cancel with "done"
 * only to be contradicted by a webhook would be a lie the UI cannot walk back.
 */
export class CooloffTransitions {
  constructor(
    private readonly ledger: LedgerTransaction,
    private readonly events: EventSink,
    private readonly transactions: TransactionStore,
    private readonly envelopes: EnvelopeReservationManager,
    private readonly clock: Clock,
  ) {}

  /** Maturity: the timer wins this in its own transaction *before* any HTTP. */
  mature(txn: Transaction): CooloffMove {
    return this.ledger.run("gateway.cooloff.mature", () => {
      const won = this.transactions.transition(
        txn.id,
        "pending_cooloff",
        "approved",
      );
      this.record(txn, won ? "cooloff.released" : "cooloff.race.lost", {});
      return {
        won,
        state: won ? "approved" : this.stateOf(txn),
        restoreDeadline: null,
      };
    });
  }

  cancel(txn: Transaction, reason: string): CooloffMove {
    return this.ledger.run("gateway.cooloff.cancel", () => {
      const cancelledAt = toIsoTimestamp(this.clock.now());
      const won = this.transactions.transition(
        txn.id,
        "pending_cooloff",
        "cancelled",
        cancelledAt,
      );
      this.record(txn, won ? "cooloff.cancelled" : "cooloff.race.lost", {
        reason,
      });
      if (won) {
        this.releaseCapacity(txn);
      }
      return {
        won,
        state: won ? "cancelled" : this.stateOf(txn),
        restoreDeadline: won ? this.restoreDeadline(cancelledAt) : null,
      };
    });
  }

  /** The 5 s undo, and the only backwards edge in the state machine (§3.7). */
  restore(txn: Transaction): CooloffMove {
    return this.ledger.run("gateway.cooloff.restore", () => {
      const notBefore = new Date(
        this.clock.now().getTime() - CANCEL_RESTORE_SECONDS * 1000,
      ).toISOString();
      const won = this.transactions.restore(txn.id, notBefore);
      this.record(txn, won ? "cooloff.parked" : "cooloff.race.lost", {
        restored: won,
      });
      return {
        won,
        state: won ? "pending_cooloff" : this.stateOf(txn),
        restoreDeadline: null,
      };
    });
  }

  /** Nothing was ever sent to Razorpay, so the envelope hold is given back. */
  private releaseCapacity(txn: Transaction): void {
    if (this.envelopes.release(txn.id)) {
      this.record(txn, "envelope.released", { txn_id: txn.id });
    }
    this.record(txn, "txn.cancelled", { txn_id: txn.id });
  }

  private stateOf(txn: Transaction): Transaction["state"] {
    return this.transactions.byId(txn.id)?.state ?? txn.state;
  }

  private restoreDeadline(cancelledAt: IsoTimestamp): IsoTimestamp {
    return new Date(
      Date.parse(cancelledAt) + CANCEL_RESTORE_SECONDS * 1000,
    ).toISOString();
  }

  private record(
    txn: Transaction,
    kind: EventKind,
    payload: Record<string, unknown>,
  ): void {
    this.events.append({
      tenant_id: txn.tenant_id,
      actor: "gateway",
      kind,
      txn_id: txn.id,
      request_id: null,
      mandate_id: txn.cart_mandate_id,
      payload: { hold_id: txn.cart_mandate_id, ...payload },
    });
  }
}
