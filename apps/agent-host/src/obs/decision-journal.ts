import type {
  Clock,
  EventDraft,
  EventSink,
  IdGenerator,
  Logger,
  StoredEvent,
} from "@covenant/domain";
import { GENESIS_HASH, canonicalize, sha256Hex } from "@covenant/domain";

/**
 * DECISION: `PreToolUseHook`'s `EventSink` is a **local journal**, not a write
 * into the gateway's ledger. Why: the gateway publishes no event-append route,
 * and it must not — the ledger is the verifier's record, and an agent that can
 * append to it can also write its own alibi (frontend R10). The hook's F2
 * decisions are the agent's own word about its own conduct, so they are kept
 * where the agent's word belongs: in this process, on `/chat/state` and in the
 * CLI trail, hash-chained so a tampered journal is at least *detectably*
 * tampered. Everything a judge must be able to verify — the memory-write
 * rejection, the eight seals, the payment — is ledgered by the gateway.
 */
export class DecisionJournal implements EventSink {
  private readonly events: StoredEvent[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  append(draft: EventDraft): StoredEvent {
    const now = this.clock.now();
    const header = {
      id: `urn:uuid:${this.ids.uuid()}`,
      ts: now.toISOString(),
      tenant_id: draft.tenant_id,
      actor: draft.actor,
      kind: draft.kind,
      txn_id: draft.txn_id,
      request_id: draft.request_id,
      mandate_id: draft.mandate_id,
    };
    const stored: StoredEvent = {
      ...header,
      seq: this.events.length + 1,
      ts_ms: now.getTime(),
      payload: draft.payload,
      prev_hash: this.head(),
      this_hash: hashOf(this.head(), header, draft.payload),
    };
    this.events.push(stored);
    this.logger.debug("agent.journal.appended", {
      kind: stored.kind,
      seq: stored.seq,
    });
    return stored;
  }

  entries(): readonly StoredEvent[] {
    return this.events;
  }

  /** Every entry of one kind, in append order — the F2 block list, verbatim. */
  ofKind(kind: string): readonly StoredEvent[] {
    return this.events.filter((event) => event.kind === kind);
  }

  private head(): string {
    return this.events[this.events.length - 1]?.this_hash ?? GENESIS_HASH;
  }
}

function hashOf(
  prevHash: string,
  header: Readonly<Record<string, unknown>>,
  payload: Readonly<Record<string, unknown>>,
): string {
  return sha256Hex(
    `${prevHash}\n${canonicalize(header)}\n${canonicalize(payload)}`,
  );
}
