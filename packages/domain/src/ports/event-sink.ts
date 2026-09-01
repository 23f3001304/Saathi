import type { EventDraft, StoredEvent } from "../ledger-event.js";

/**
 * The only write path to the ledger. Synchronous on purpose: the append runs
 * inside the caller's `BEGIN IMMEDIATE` transaction, and there is no `await`
 * inside a transaction (§5.3) — no ledger event, no side effect.
 */
export interface EventSink {
  append(draft: EventDraft): StoredEvent;
}
