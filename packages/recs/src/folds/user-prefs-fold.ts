import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventKind, StoredEvent } from "@covenant/domain";
import type { FoldReducer } from "@covenant/ledger";

import { arrayField, objectField, optionalText } from "../fold-support.js";

const PREF_TIER = 3;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.0;
const REGRET_FACTOR = 0.85;
const KEEP_FACTOR = 1.05;

/** New key: `weight` starts at 1.0. Reinforcement never touches `weight`. */
const REINFORCE_SQL = `INSERT INTO user_prefs
  (tenant_id, user_id, pref_key, value_json, tier, weight, observations, updated_event_seq)
VALUES (@tenant_id, @user_id, @pref_key, @value_json, ${PREF_TIER}, 1.0, 1, @seq)
ON CONFLICT(tenant_id, user_id, pref_key) DO UPDATE SET
  value_json = excluded.value_json,
  observations = user_prefs.observations + 1,
  updated_event_seq = excluded.updated_event_seq
WHERE user_prefs.updated_event_seq < excluded.updated_event_seq`;

/** `regret.recorded` has no per-SKU detail (section 10.3), so the signal is
 * applied to every preference the user has already revealed (see class doc). */
const REGRET_SQL = `UPDATE user_prefs
  SET weight = MAX(${MIN_WEIGHT}, MIN(${MAX_WEIGHT}, weight * @factor)),
      updated_event_seq = @seq
  WHERE tenant_id = @tenant_id AND user_id = @user_id
    AND updated_event_seq < @seq`;

/**
 * `FoldReducer` over P3-only preference and confirmation events
 * (backend-architecture.md section 2.6, section 3.10): `intent.signed`,
 * `user.confirmed`, `cart.assembled`, `regret.recorded`. `user_prefs.tier`
 * is `CHECK (tier = 3)` by construction — every row this fold writes carries
 * only signals a user actually signed, confirmed, or a cart already bounded
 * by a signed intent (AM1) reached construction with.
 *
 * DECISION: `regret.recorded` carries only `{txn_id, verdict, note}` — no
 * SKU or category. Correlating a regret to the specific preference it
 * should discount would require reading a table this reducer did not write
 * (`cart.assembled`'s line items via `txn_id`), which section 3.10 rule 1
 * forbids. Instead the fold reads only its own prior rows and applies a
 * uniform shrink (`regret`) or nudge (`keep`) to every preference the user
 * has already revealed — the `weight` column's own DDL comment calls it
 * "regret-adjusted" for exactly this reason. `RegretWeighter` (packages/recs)
 * layers a SKU-specific signal on top at serve time, where it may read the
 * raw `events` table directly.
 */
export class UserPrefsFold implements FoldReducer {
  readonly name = "user_prefs";

  readonly kinds: readonly EventKind[] = [
    "intent.signed",
    "user.confirmed",
    "cart.assembled",
    "regret.recorded",
  ];

  readonly tables: readonly string[] = ["user_prefs"];

  apply(db: SqliteDatabase, event: StoredEvent): void {
    switch (event.kind) {
      case "intent.signed":
        this.reinforceAllowlists(db, event);
        return;
      case "user.confirmed":
        this.reinforceConfirmation(db, event);
        return;
      case "cart.assembled":
        this.reinforceCartLines(db, event);
        return;
      case "regret.recorded":
        this.applyRegret(db, event);
        return;
      default:
        return;
    }
  }

  private reinforceAllowlists(db: SqliteDatabase, event: StoredEvent): void {
    const bounds = objectField(event.payload["bounds"]);
    if (bounds === null) {
      return;
    }
    for (const id of stringsIn(bounds["merchants"])) {
      this.reinforce(db, event, `merchant:${id}`, { source: "intent.signed" });
    }
    for (const id of stringsIn(bounds["skus"])) {
      this.reinforce(db, event, `sku:${id}`, { source: "intent.signed" });
    }
  }

  private reinforceConfirmation(db: SqliteDatabase, event: StoredEvent): void {
    const subject = optionalText(event.payload, "subject");
    if (subject === null) {
      return;
    }
    this.reinforce(db, event, subject, {
      predicate: optionalText(event.payload, "predicate"),
      value: event.payload["value"] ?? null,
    });
  }

  private reinforceCartLines(db: SqliteDatabase, event: StoredEvent): void {
    for (const line of arrayField(event.payload, "lines")) {
      const row = objectField(line);
      const sku = row === null ? null : stringField(row, "sku_id") ?? stringField(row, "sku");
      if (sku === null) {
        continue;
      }
      this.reinforce(db, event, `sku:${sku}`, { source: "cart.assembled" });
    }
  }

  private applyRegret(db: SqliteDatabase, event: StoredEvent): void {
    const verdict = optionalText(event.payload, "verdict");
    if (verdict !== "regret" && verdict !== "keep") {
      return;
    }
    const factor = verdict === "regret" ? REGRET_FACTOR : KEEP_FACTOR;
    db.prepare(REGRET_SQL).run({
      tenant_id: event.tenant_id,
      user_id: userIdOf(event),
      factor,
      seq: event.seq,
    });
  }

  private reinforce(
    db: SqliteDatabase,
    event: StoredEvent,
    prefKey: string,
    value: Record<string, unknown>,
  ): void {
    db.prepare(REINFORCE_SQL).run({
      tenant_id: event.tenant_id,
      user_id: userIdOf(event),
      pref_key: prefKey,
      value_json: JSON.stringify(value),
      seq: event.seq,
    });
  }
}

/**
 * DECISION: the event header carries `tenant_id` but not `user_id` (section
 * 3.2) — only the payload does. Every kind this fold consumes is emitted
 * about a single signed-in user, so `user_id` is read from the payload with
 * an `"unknown"` fallback that a real payload should never hit.
 */
function userIdOf(event: StoredEvent): string {
  return optionalText(event.payload, "user_id") ?? "unknown";
}

function stringsIn(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function stringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}
