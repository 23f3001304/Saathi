import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type {
  NonceBurnRecord,
  NonceBurnResult,
  NoncePurpose,
  NonceRegistry,
  NonceState,
} from "@covenant/domain";
import { resolveIdempotency } from "@covenant/domain";

/** The write-back half of the burn, kept as its own seam so a use case that
 *  only needs it does not receive the ability to burn. */
export interface NonceResponseStore {
  recordResponse(
    nonce: string,
    purpose: NoncePurpose,
    responseJson: string,
  ): void;
}

interface NonceRow {
  readonly nonce: string;
  readonly purpose: string;
  readonly tenant_id: string;
  readonly payload_hash: string;
  readonly idempotency_key: string;
  readonly burned_at: string;
  readonly burn_event_id: string;
  readonly response_json: string;
}

const PEEK_SQL = "SELECT * FROM nonces WHERE nonce = ? AND purpose = ?";

const RESPONSE_SQL =
  "UPDATE nonces SET response_json = ? WHERE nonce = ? AND purpose = ?";

const BURN_SQL = `
  INSERT INTO nonces
    (nonce, purpose, tenant_id, payload_hash, idempotency_key,
     burned_at, burn_event_id, response_json)
  VALUES (@nonce, @purpose, @tenantId, @payloadHash, @idempotencyKey,
          @burnedAt, @burnEventId, @responseJson)`;

/**
 * DECISION: §2.3 places this adapter in `packages/mandates`, which did not ship
 * it. The gateway carries it rather than leave the burn unenforced, because the
 * `INSERT`'s `PRIMARY KEY (nonce, purpose)` violation **is** the replay
 * defence (§3.6) — a policy check that could be misconfigured away is not.
 * The use case depends on the `NonceRegistry` port, so a later `mandates`
 * implementation is a one-line swap in the composition root.
 */
export class SqliteNonceRegistry implements NonceRegistry, NonceResponseStore {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  peek(nonce: string, purpose: NoncePurpose): NonceState | null {
    const row = this.statement(PEEK_SQL).get(nonce, purpose) as
      | NonceRow
      | undefined;
    return row === undefined ? null : stateOf(row);
  }

  /**
   * Losing the race is not an exception: the caller gets `conflict` or `replay`
   * with the stored state so it can answer 409 or replay `response_json`
   * verbatim (§4.5).
   */
  burn(record: NonceBurnRecord): NonceBurnResult {
    const stored = this.peek(record.nonce, record.purpose);
    if (stored !== null) {
      return loserOf(stored, record);
    }
    this.statement(BURN_SQL).run({ ...record });
    return { status: "burned" };
  }

  /**
   * The `execute-payment` bracket burns before the HTTP call and only knows the
   * answer after it (§5.1), so the replayable response is written by the
   * outcome transaction rather than left as the placeholder the burn stored.
   */
  recordResponse(
    nonce: string,
    purpose: NoncePurpose,
    responseJson: string,
  ): void {
    this.statement(RESPONSE_SQL).run(responseJson, nonce, purpose);
  }

  private statement(sql: string): Statement {
    const cached = this.cache.get(sql);
    if (cached !== undefined) {
      return cached;
    }
    const prepared = this.db.prepare(sql);
    this.cache.set(sql, prepared);
    return prepared;
  }
}

function loserOf(stored: NonceState, record: NonceBurnRecord): NonceBurnResult {
  const outcome = resolveIdempotency(stored, {
    tenantId: record.tenantId,
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
  });
  return outcome.status === "replay"
    ? { status: "replay", state: stored }
    : { status: "conflict", state: stored };
}

function stateOf(row: NonceRow): NonceState {
  return {
    nonce: row.nonce,
    purpose: row.purpose as NoncePurpose,
    tenantId: row.tenant_id,
    payloadHash: row.payload_hash,
    idempotencyKey: row.idempotency_key,
    burnedAt: row.burned_at,
    burnEventId: row.burn_event_id,
    responseJson: row.response_json,
  };
}
