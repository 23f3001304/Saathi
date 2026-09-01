import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type {
  Clock,
  EventDraft,
  EventHeader,
  EventSink,
  IdGenerator,
  LedgerHead,
  Sha256Hex,
  StoredEvent,
} from "@covenant/domain";
import { GENESIS_HASH, isEventKind, toIsoTimestamp } from "@covenant/domain";

import { EVENT_INSERT_SQL, toEventRecord } from "./event-record.js";
import type { HashChain } from "./hash-chain.js";
import type { AppendedEventCollector } from "./ledger-transaction.js";

const HEAD_SQL = "SELECT seq, this_hash FROM events ORDER BY seq DESC LIMIT 1";

/**
 * The only write path to the ledger. The caller supplies a draft; `seq`, `ts`,
 * `id` and both hashes belong to the sink, so a caller can never forge a link.
 * Synchronous by construction: the append runs inside the caller's
 * `BEGIN IMMEDIATE` transaction and there is no `await` inside one.
 *
 * DECISION: a fifth collaborator, the transaction's frame collector, joins the
 * four of section 2.1 — without a producer, section 4.11's afterCommit buffer
 * can never be filled.
 */
export class SqliteEventWriter implements EventSink {
  private insert: Statement | null = null;
  private headQuery: Statement | null = null;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly chain: HashChain,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly collector: AppendedEventCollector,
  ) {}

  append(draft: EventDraft): StoredEvent {
    if (!isEventKind(draft.kind)) {
      throw new RangeError(`Not an EVENT_KINDS member: "${draft.kind}"`);
    }
    const head = this.head();
    const event = this.seal(draft, head);
    this.statement().run(toEventRecord(event));
    this.collector.collect(event);
    return event;
  }

  /**
   * `seq` is `head.seq + 1`, not AUTOINCREMENT: the audit UI folds a gapless
   * monotonic id and reconnects on it, and AUTOINCREMENT consumes ids on
   * rolled-back inserts (decision 9). Safe because the schedule of write
   * transactions is serial.
   */
  // SINGLE-WRITER ASSUMPTION
  private seal(draft: EventDraft, head: LedgerHead | null): StoredEvent {
    const now = this.clock.now();
    const prevHash: Sha256Hex = head === null ? GENESIS_HASH : head.this_hash;
    const header: EventHeader = {
      id: this.ids.uuid(),
      ts: toIsoTimestamp(now),
      tenant_id: draft.tenant_id,
      actor: draft.actor,
      kind: draft.kind,
      txn_id: draft.txn_id,
      request_id: draft.request_id,
      mandate_id: draft.mandate_id,
    };
    return {
      ...header,
      seq: head === null ? 1 : head.seq + 1,
      ts_ms: now.getTime(),
      payload: draft.payload,
      prev_hash: prevHash,
      this_hash: this.chain.hash(prevHash, header, draft.payload),
    };
  }

  // SINGLE-WRITER ASSUMPTION
  private head(): LedgerHead | null {
    this.headQuery ??= this.db.prepare(HEAD_SQL);
    return (this.headQuery.get() as LedgerHead | undefined) ?? null;
  }

  private statement(): Statement {
    this.insert ??= this.db.prepare(EVENT_INSERT_SQL);
    return this.insert;
  }
}
