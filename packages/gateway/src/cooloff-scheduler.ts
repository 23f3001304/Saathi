import type {
  Clock,
  FinalizedToPass,
  IdGenerator,
  Logger,
  Transaction,
} from "@covenant/domain";
import { sha256Of, toIsoTimestamp } from "@covenant/domain";

import type { CooloffTransitions } from "./cooloff-transitions.js";
import type { ExecutePaymentService } from "./execute-payment-service.js";
import type { CooloffActionResponse } from "./schemas/control-routes.js";
import type { MandateStore } from "./sql/mandate-store.js";
import type { TransactionStore } from "./sql/transaction-store.js";

export type CooloffOutcome =
  | { readonly status: "ok"; readonly body: CooloffActionResponse }
  | {
      readonly status: "lost";
      readonly reasonCode: "TXN_ALREADY_FINALIZED";
      readonly toPass: FinalizedToPass;
    };

export type Timer = { readonly cancel: () => void };

/** Injected so tests advance time instead of waiting a day for a hold. */
export interface TimerFactory {
  after(ms: number, run: () => void): Timer;
}

/**
 * Ulysses precommitment, armed. Timers are **rebuilt from ledger-derived
 * state** at boot — the `transactions` fold is the source of what is pending,
 * so a restart cannot silently drop a hold or double-arm one (§2.4, §5.1).
 *
 * The timer never calls Razorpay directly: it wins the guarded `UPDATE` in its
 * own transaction first, and only then does the execute bracket begin.
 */
export class CooloffScheduler {
  private readonly armed = new Map<string, Timer>();

  constructor(
    private readonly transactions: TransactionStore,
    private readonly mandates: MandateStore,
    private readonly transitions: CooloffTransitions,
    private readonly execute: ExecutePaymentService,
    private readonly timers: TimerFactory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  /** Boot recovery: every `pending_cooloff` row gets exactly one timer. */
  rebuild(): number {
    const pending = this.transactions.pendingCooloff();
    for (const txn of pending) {
      this.arm(txn);
    }
    this.logger.info("gateway.cooloff.rebuilt", { holds: pending.length });
    return pending.length;
  }

  arm(txn: Transaction): void {
    this.disarm(txn.id);
    const due = txn.cooloff_until === null ? 0 : Date.parse(txn.cooloff_until);
    const delay = Math.max(0, due - this.clock.now().getTime());
    this.armed.set(
      txn.id,
      this.timers.after(delay, () => {
        void this.mature(txn.id);
      }),
    );
  }

  /** Idempotent: disarming an unarmed hold is a no-op, not an error. */
  disarm(txnId: string): void {
    this.armed.get(txnId)?.cancel();
    this.armed.delete(txnId);
  }

  async mature(txnId: string): Promise<void> {
    this.disarm(txnId);
    const txn = this.transactions.byId(txnId);
    if (txn === null || !this.transitions.mature(txn).won) {
      return;
    }
    const jwt = this.mandates.jwtOf(txn.payment_mandate_id);
    if (jwt === null) {
      this.logger.error("gateway.cooloff.no_mandate", { txn_id: txnId });
      return;
    }
    await this.execute.execute({
      body: { payment_mandate_jwt: jwt, tenant_id: txn.tenant_id },
      requestId: this.ids.uuid(),
      idempotencyKey: this.ids.uuid(),
      payloadHash: sha256Of({ txn_id: txnId, purpose: "cooloff_maturity" }),
    });
  }

  cancel(holdId: string, reason: string): CooloffOutcome {
    return this.act(holdId, (txn) => {
      const move = this.transitions.cancel(txn, reason);
      if (move.won) {
        this.disarm(txn.id);
      }
      return { txn, move };
    });
  }

  restore(holdId: string): CooloffOutcome {
    return this.act(holdId, (txn) => {
      const move = this.transitions.restore(txn);
      if (move.won) {
        this.arm(this.transactions.byId(txn.id) ?? txn);
      }
      return { txn, move };
    });
  }

  /** `:id` is the hold id, which is the cart mandate `jti` — not the txn id. */
  private act(
    holdId: string,
    move: (txn: Transaction) => {
      txn: Transaction;
      move: { won: boolean; state: Transaction["state"]; restoreDeadline: string | null };
    },
  ): CooloffOutcome {
    const found = this.transactions.byCartMandate(holdId);
    if (found === null) {
      return lost("cancelled", this.clock);
    }
    const applied = move(found);
    if (!applied.move.won) {
      return lost(applied.move.state, this.clock);
    }
    return {
      status: "ok",
      body: {
        ok: true,
        hold_id: holdId,
        txn_id: applied.txn.id,
        state: applied.move.state === "cancelled" ? "cancelled" : "pending_cooloff",
        restore_deadline: applied.move.restoreDeadline,
        event_id: applied.txn.id,
      },
    };
  }
}

/** Losing the race is not an error and is not an attack (§5.2 e). */
function lost(state: string, clock: Clock): CooloffOutcome {
  return {
    status: "lost",
    reasonCode: "TXN_ALREADY_FINALIZED",
    toPass: {
      current_state: state,
      finalized_at: toIsoTimestamp(clock.now()),
      remedy: "none",
    },
  };
}
