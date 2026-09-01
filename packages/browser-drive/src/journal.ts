import type { Clock } from "@covenant/domain";

import type { SessionState } from "./session-state.js";

export type JournalEventKind =
  | "session.launched"
  | "session.closed"
  | "page.navigated"
  | "page.clicked"
  | "page.typed"
  | "page.keyed"
  | "page.scrolled"
  | "page.read"
  | "context.flagged"
  | "action.blocked"
  | "handoff.raised"
  | "handoff.resumed"
  | "handoff.refused"
  | "readiness.polled"
  | "cart.inspected"
  | "covenant.checked"
  | "window.fronted"
  | "handoff.pointed";

/**
 * Who caused the line. A column rather than a `detail` key because the ledger
 * has to be able to answer "did the agent do this, or did I?" by reading one
 * field — the split-control claim is only checkable if the trail records the
 * split.
 */
export type JournalActor = "agent" | "user";

export interface JournalDraft {
  readonly kind: JournalEventKind;
  readonly url: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
}

export interface JournalEvent extends JournalDraft {
  readonly seq: number;
  readonly at: string;
  readonly session_id: string;
  readonly state: SessionState;
  readonly actor: JournalActor;
}

/**
 * The write port. JSONL rather than a structured store because agent-host
 * forwards these into the real hash-chained ledger later — one line, one event,
 * no framing to undo.
 */
export interface JournalSink {
  write(line: string): void;
}

/** Keeps the lines in memory; what the demo prints and the tests assert on. */
export class CollectingJournalSink implements JournalSink {
  private readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }

  all(): readonly string[] {
    return [...this.lines];
  }
}

/** Fans one append out to several sinks (file + stdout, in the demo). */
export class TeeJournalSink implements JournalSink {
  constructor(private readonly sinks: readonly JournalSink[]) {}

  write(line: string): void {
    for (const sink of this.sinks) {
      sink.write(line);
    }
  }
}

/**
 * Append-only by construction: there is no method that edits or removes, and
 * `entries()` hands back a copy. Sequence numbers are dense so a gap in a
 * forwarded stream is visible without needing the hash chain this package
 * deliberately does not implement.
 */
export class Journal {
  private seq = 0;
  private readonly events: JournalEvent[] = [];

  constructor(
    private readonly sink: JournalSink,
    private readonly clock: Clock,
    private readonly sessionId: string,
  ) {}

  append(
    draft: JournalDraft,
    state: SessionState,
    actor: JournalActor = "agent",
  ): JournalEvent {
    this.seq += 1;
    const event: JournalEvent = {
      ...draft,
      seq: this.seq,
      at: this.clock.now().toISOString(),
      session_id: this.sessionId,
      state,
      actor,
    };
    this.events.push(event);
    this.sink.write(JSON.stringify(event));
    return event;
  }

  entries(): readonly JournalEvent[] {
    return [...this.events];
  }

  count(kind: JournalEventKind): number {
    return this.events.filter((event) => event.kind === kind).length;
  }
}
