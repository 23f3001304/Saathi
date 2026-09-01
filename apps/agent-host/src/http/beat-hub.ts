import type { Clock, Logger } from "@covenant/domain";

import type { BeatCursor } from "./beat-cursor.js";
import type { BeatDraft } from "./beat-draft.js";
import type { ChatBeat } from "./chat-beat.js";

export const HEARTBEAT_MS = 15_000;

/**
 * Where a transport puts what the hub publishes. Both rungs — the socket and
 * the SSE stream — are the same subscriber to this class; only the framing
 * differs, which is why a client that falls from one to the other resumes at
 * the same cursor rather than starting a different conversation.
 */
export interface BeatSink {
  readonly deliver: (epoch: number, index: number, beat: ChatBeat) => void;
  /** The indices this client holds belong to a run that no longer exists. */
  readonly rebase: (epoch: number) => void;
  readonly close: () => void;
}

interface Subscriber {
  readonly sink: BeatSink;
  lastSent: number;
}

/**
 * Where the log is kept once this process is gone. It is not a `BeatSink`: a
 * sink is a client that may drop, be rebased or be closed, and this one is
 * none of those — it is written to before any client exists and after the last
 * one leaves.
 */
export interface BeatRecorder {
  readonly record: (epoch: number, index: number, beat: ChatBeat) => void;
}

export interface BeatHubOptions {
  readonly heartbeatMs?: number;
  readonly recorder?: BeatRecorder;
  /** The first epoch this process may use; a restart must not reuse one. */
  readonly startEpoch?: number;
  /**
   * Where the next epoch comes from when several hubs share one process. A
   * lane-per-conversation host runs a hub per lane, and hubs that each counted
   * `+1` privately would mint the same `(epoch, index)` in two conversations
   * at once. Absent, the hub counts alone — the single-hub tests and the CLI
   * keep exactly the arithmetic they had.
   */
  readonly epochs?: { next(): number };
}

/**
 * The conversation fan-out. Beats are appended once and replayed to every
 * subscriber, so a browser that opens the stream mid-purchase sees the whole
 * run rather than its tail — a cursor of `after` resumes after beat `after`,
 * which is what makes a reload during the demo survivable.
 *
 * DECISION: beats are retained for the life of the process rather than being
 * fire-and-forget. Why: `GET /chat/state` and the CLI's causal trail read the
 * same list the stream published, so there is exactly one account of what the
 * agent said — a stream and a state endpoint that could disagree would make the
 * conversation pane the one surface a judge cannot check.
 *
 * DECISION: a beat is addressed by `(epoch, index)`, not by index alone. Why:
 * a new run rebases the indices to 1, and so does a restarted process. A client
 * holding index 18 would read the next run's opening beat as one it had already
 * seen and drop the whole run. The epoch is what lets a reconnecting client
 * tell "I am behind" from "the log I was reading is gone".
 *
 * DECISION: the first epoch is handed in rather than fixed at 1. Why: the
 * durable log outlives the process, so a restarted host that began again at 1
 * would mint `(1, 4)` a second time and a client holding the first one could
 * not tell the two apart. Starting past the highest epoch the log has ever
 * held makes `(epoch, index)` an address that survives a restart.
 */
export class BeatHub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly beats: ChatBeat[] = [];
  private startedAtMs: number;
  private generation: number;
  readonly heartbeatMs: number;
  private readonly recorder: BeatRecorder | null;
  private readonly epochs: { next(): number } | null;

  constructor(
    private readonly clock: Clock,
    private readonly logger: Logger,
    options: BeatHubOptions = {},
  ) {
    this.startedAtMs = clock.now().getTime();
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.recorder = options.recorder ?? null;
    this.epochs = options.epochs ?? null;
    this.generation = this.epochs?.next() ?? options.startEpoch ?? 1;
  }

  get epoch(): number {
    return this.generation;
  }

  /** Rebases `offsetMs` and the indices, so each run reads as its own timeline. */
  restart(): void {
    this.beats.length = 0;
    this.startedAtMs = this.clock.now().getTime();
    this.generation = this.epochs?.next() ?? this.generation + 1;
    for (const subscriber of this.subscribers) {
      subscriber.lastSent = 0;
      subscriber.sink.rebase(this.generation);
    }
  }

  emit(draft: BeatDraft): ChatBeat {
    const beat = {
      ...draft,
      offsetMs: this.clock.now().getTime() - this.startedAtMs,
    } as ChatBeat;
    this.beats.push(beat);
    const index = this.beats.length;
    this.recorder?.record(this.generation, index, beat);
    for (const subscriber of this.subscribers) {
      this.pushTo(subscriber, index, beat);
    }
    this.logger.debug("chat.beat", { kind: beat.kind, index });
    return beat;
  }

  snapshot(): readonly ChatBeat[] {
    return this.beats;
  }

  closeAll(): void {
    for (const subscriber of [...this.subscribers]) {
      subscriber.sink.close();
    }
    this.subscribers.clear();
  }

  /**
   * Replays what the cursor has not seen, then follows. `after` is honoured
   * only when the cursor names this epoch; a cursor from an earlier run starts
   * over, and is told so, rather than silently skipping beats it never saw.
   */
  subscribe(sink: BeatSink, cursor: BeatCursor): () => void {
    const stale = cursor.epoch !== null && cursor.epoch !== this.generation;
    const subscriber: Subscriber = { sink, lastSent: stale ? 0 : cursor.after };
    if (stale) {
      sink.rebase(this.generation);
    }
    this.subscribers.add(subscriber);
    this.beats.forEach((beat, offset) => {
      this.pushTo(subscriber, offset + 1, beat);
    });
    this.logger.info("chat.stream.client", {
      transport: cursor.transport,
      after: cursor.after,
      epoch: cursor.epoch,
      rebased: stale,
      subscribers: this.subscribers.size,
    });
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private pushTo(subscriber: Subscriber, index: number, beat: ChatBeat): void {
    if (index > subscriber.lastSent) {
      subscriber.lastSent = index;
      subscriber.sink.deliver(this.generation, index, beat);
    }
  }
}
