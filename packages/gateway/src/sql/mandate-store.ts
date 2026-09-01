import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type {
  IsoTimestamp,
  MandateKind,
  MandateStatus,
  Sha256Hex,
  Sha256Ref,
} from "@covenant/domain";

export interface MandateRowDraft {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: MandateKind;
  readonly vcJwt: string;
  readonly jwtHash: Sha256Hex;
  readonly status: MandateStatus;
  readonly parentId: string | null;
  readonly memoryDigest: Sha256Ref | null;
  readonly cartHash: Sha256Ref | null;
  readonly issuerKid: string;
  readonly iat: IsoTimestamp;
  readonly exp: IsoTimestamp;
  readonly createdEventId: string;
}

const INSERT_SQL = `
  INSERT INTO mandates
    (id, tenant_id, kind, vc_jwt, jwt_hash, nonce, status, parent_id,
     memory_digest, cart_hash, issuer_kid, iat, exp, created_event_id)
  VALUES (@id, @tenantId, @kind, @vcJwt, @jwtHash, @id, @status, @parentId,
          @memoryDigest, @cartHash, @issuerKid, @iat, @exp, @createdEventId)`;

const UPSERT_SQL = `${INSERT_SQL}
  ON CONFLICT(id) DO UPDATE SET status = excluded.status`;

const STATUS_SQL = "UPDATE mandates SET status = ? WHERE id = ?";

/**
 * The `mandates` projection row (§3.6). `nonce` is the `jti` — the design names
 * them separately but they are one value, so the insert binds `@id` twice
 * rather than letting a caller pass two things that must agree.
 *
 * DECISION: §2.3's `MandateProjection` did not ship, and `transactions`
 * carries a foreign key to `mandates(id)`. The gateway writes the row inside
 * the same transaction as the ledger append, so the projection is never ahead
 * of the events it is derived from and a rebuild can still replace it.
 */
export class MandateStore {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  record(draft: MandateRowDraft): void {
    this.statement(INSERT_SQL).run({ ...draft });
  }

  /** A cart re-presented under a fresh idempotency key must not error here. */
  upsert(draft: MandateRowDraft): void {
    this.statement(UPSERT_SQL).run({ ...draft });
  }

  /** The cool-off timer executes the credential it parked, never a new one. */
  jwtOf(id: string | null): string | null {
    if (id === null) {
      return null;
    }
    const row = this.statement("SELECT vc_jwt FROM mandates WHERE id = ?").get(
      id,
    ) as { readonly vc_jwt: string } | undefined;
    return row?.vc_jwt ?? null;
  }

  setStatus(id: string, status: MandateStatus): void {
    this.statement(STATUS_SQL).run(status, id);
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
