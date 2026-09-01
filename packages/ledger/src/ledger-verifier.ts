import type { Clock, EventSource, Sha256Hex, StoredEvent } from "@covenant/domain";
import { GENESIS_HASH } from "@covenant/domain";

import type { HashChain } from "./hash-chain.js";

/** The `POST /ledger/verify` body (section 4.10). */
export interface ChainVerification {
  readonly ok: boolean;
  readonly height: number;
  readonly ms: number;
  /** `null` when the chain is intact; otherwise the first bad `seq`. */
  readonly firstDivergentSeq: number | null;
  readonly headHash: Sha256Hex;
}

interface Cursor {
  seq: number;
  hash: Sha256Hex;
}

const DEFAULT_BATCH = 500;

/**
 * Walks the chain from GENESIS and reports the first divergence. Three things
 * can be wrong and all three are corruption: a gap in `seq`, a link that does
 * not extend its predecessor, and a digest that does not match its own header
 * and payload. The third is what catches an in-place edit of `actor` or
 * `kind` — the fields the audit UI displays (decision 10).
 *
 * DECISION: `Clock` joins section 2.1's collaborators. Why: the response
 * carries an elapsed `ms`, and no package may call `Date.now()`.
 */
export class LedgerVerifier {
  constructor(
    private readonly source: EventSource,
    private readonly chain: HashChain,
    private readonly clock: Clock,
  ) {}

  verify(batchSize: number = DEFAULT_BATCH): ChainVerification {
    const startedAt = this.clock.now().getTime();
    const cursor: Cursor = { seq: 0, hash: GENESIS_HASH };
    let divergent: number | null = null;
    for (;;) {
      const batch = this.source.readFrom(cursor.seq + 1, batchSize);
      if (batch.length === 0) {
        break;
      }
      divergent = this.walk(batch, cursor);
      if (divergent !== null) {
        break;
      }
    }
    return this.result(cursor, divergent, startedAt);
  }

  /**
   * Section 4.12's `chain_ok`. A transaction's events are not adjacent in the
   * global order, so the slice check is per-link: each digest must still
   * recompute from its own stored header, payload and `prev_hash`.
   */
  verifyTxn(txnId: string): boolean {
    return this.source
      .byTxn(txnId)
      .every((event) => this.chain.recompute(event) === event.this_hash);
  }

  private walk(batch: readonly StoredEvent[], cursor: Cursor): number | null {
    for (const event of batch) {
      const expected = cursor.seq + 1;
      if (event.seq !== expected || !this.chain.verifyLink(event, cursor.hash)) {
        return event.seq;
      }
      cursor.seq = event.seq;
      cursor.hash = event.this_hash;
    }
    return null;
  }

  private result(
    cursor: Cursor,
    divergent: number | null,
    startedAt: number,
  ): ChainVerification {
    return {
      ok: divergent === null,
      height: cursor.seq,
      ms: this.clock.now().getTime() - startedAt,
      firstDivergentSeq: divergent,
      headHash: cursor.hash,
    };
  }
}
