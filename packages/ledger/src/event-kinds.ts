/**
 * The frozen event-kind catalog reducers key on (section 10.3). It is declared
 * once, in `domain`, because `domain/src/ledger-event.ts` already types
 * `EventDraft.kind` against it; re-declaring it here would create two unions
 * that could drift, which is exactly the translation layer section 4.11
 * forbids. This module is the ledger-side name the design specifies.
 *
 * DECISION: section 2.1 places the catalog here; it is re-exported from
 * `domain` instead. Why: `domain` may not import `ledger`, and
 * `EventDraft.kind` is already typed against the union.
 */
export {
  ATTACK_DETECTED_SOURCES,
  EVENT_ACTORS,
  EVENT_KINDS,
  UI_EVENT_KINDS,
  isEventKind,
} from "@covenant/domain";

export type {
  AttackDetectedSource,
  EventActor,
  EventKind,
} from "@covenant/domain";
