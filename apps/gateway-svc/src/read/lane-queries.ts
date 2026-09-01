import type { Database as SqliteDatabase } from "better-sqlite3";

import type { ActionClass, MemoryEntry } from "@covenant/domain";
import { ACTION_POLICY } from "@covenant/domain";
import type { MemoryRow } from "@covenant/memory";
import { MEMORY_SELECT_SQL, toMemoryEntry } from "@covenant/memory";

export interface AttackLaneItem {
  readonly seq: number;
  readonly ts: string;
  readonly kind: string;
  readonly reason_code: string | null;
  readonly attack_id: string | null;
  readonly human: string | null;
  readonly txn_id: string | null;
}

interface IntentRow {
  readonly payload_json: string;
}

/**
 * DECISION: the lane is the `attack_lane` view **plus** `tool.call.blocked`.
 * Why: the view (§3.2) predates the buyer's `PreToolUse` hook, which ledgers an
 * F2 interception as `tool.call.blocked` because no `ReasonCode` exists for
 * "the agent tried to call a money tool it may not call". The view is frozen
 * DDL, so the union happens here — otherwise the demo's most-cited defence
 * would be the one block the attack lane never lights for.
 */
const LANE_SQL = `SELECT seq, ts, kind, reason_code, attack_id, human, txn_id
  FROM attack_lane WHERE tenant_id = ?
UNION ALL
SELECT seq, ts, kind,
       json_extract(payload_json, '$.reason') AS reason_code,
       json_extract(payload_json, '$.attack_id') AS attack_id,
       json_extract(payload_json, '$.tool') AS human,
       txn_id
  FROM events WHERE tenant_id = ? AND kind = 'tool.call.blocked'
ORDER BY seq DESC LIMIT ?`;

const LATEST_INTENT_SQL = `SELECT payload_json FROM events
  WHERE tenant_id = ? AND kind = 'intent.signed' ORDER BY seq DESC LIMIT 1`;

/**
 * The browse endpoint of §4.10 — `memoryEntryView[]` and **no digest**. A GET
 * that minted a provenance digest would make digests cacheable, linkable and
 * obtainable outside a cart context; the digest is minted only by
 * `POST /memory/retrieve`, in the act of building the cart it will be signed
 * into (decision: §4.10).
 */
function browseSqlFor(actionClass: ActionClass): string {
  const policy = ACTION_POLICY[actionClass];
  const types = policy.types.map((type) => `'${type}'`).join(", ");
  const quarantine = policy.quarantinedVisible ? "" : " AND quarantined = 0";
  return `${MEMORY_SELECT_SQL}
    WHERE tenant_id = ? AND t_expired IS NULL AND tier >= ${policy.tierFloor}
      AND type IN (${types})${quarantine}
    ORDER BY t_created DESC LIMIT ?`;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** `/audit?lane=attacks`, `/memory` and `/covenant` (§4.10). */
export class LaneQueries {
  constructor(private readonly db: SqliteDatabase) {}

  attacks(tenantId: string, limit: number): readonly AttackLaneItem[] {
    return this.db
      .prepare(LANE_SQL)
      .all(tenantId, tenantId, limit) as AttackLaneItem[];
  }

  browse(
    tenantId: string,
    actionClass: ActionClass,
    limit: number,
  ): readonly MemoryEntry[] {
    const rows = this.db
      .prepare(browseSqlFor(actionClass))
      .all(tenantId, limit) as MemoryRow[];
    return rows.map(toMemoryEntry);
  }

  /**
   * The signing sheet's own record: the bounds the user actually signed, taken
   * from the `intent.signed` ledger event rather than re-derived from a
   * credential the reader would have to trust itself to re-verify.
   */
  latestBounds(tenantId: string): Readonly<Record<string, unknown>> {
    const row = this.db.prepare(LATEST_INTENT_SQL).get(tenantId) as
      | IntentRow
      | undefined;
    if (row === undefined) {
      return {};
    }
    return asRecord(asRecord(JSON.parse(row.payload_json))["bounds"]);
  }
}
