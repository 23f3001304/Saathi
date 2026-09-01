import type { Sha256Hex } from "../hash-ref.js";
import type { StoredEvent } from "../ledger-event.js";

export interface LedgerHead {
  readonly seq: number;
  readonly this_hash: Sha256Hex;
}

/**
 * Read-only ledger access, separate from `EventSink` so that a reader — the
 * flywheel, the audit assembler — receives no ability to append (decision 4).
 */
export interface EventSource {
  readFrom(seq: number, limit: number): readonly StoredEvent[];
  byTxn(txnId: string): readonly StoredEvent[];
  /** `null` on an empty ledger; the chain then starts from `GENESIS_HASH`. */
  head(): LedgerHead | null;
}
