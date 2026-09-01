import type { LedgerFrame, Logger } from "@covenant/domain";
import type { FramePublisher, SqliteEventReader } from "@covenant/ledger";

export const HEARTBEAT_MS = 15_000;

const BACKFILL_LIMIT = 500;

interface Subscriber {
  readonly send: (chunk: string) => void;
  readonly close: () => void;
  readonly heartbeat: NodeJS.Timeout;
  lastSent: number;
}

/** `id: <seq>\ndata: <json>\n\n` — the §4.11 wire format, verbatim. */
function frameChunk(frame: LedgerFrame): string {
  return `id: ${frame.id}\ndata: ${JSON.stringify(frame)}\n\n`;
}

/**
 * The SSE fan-out (§4.11). `LedgerTransaction` hands frames here in its
 * `afterCommit` callback, in `seq` order, and never mid-transaction: a frame
 * is a claim that an event *is in the ledger*, so publishing one a later
 * `RAISE(ABORT)` would erase is not allowed — it would break gaplessness for
 * every connected client at once.
 *
 * `Last-Event-ID: <n>` replays `seq > n` from the reader and then attaches to
 * live. Backfill and attach happen in one synchronous tick (better-sqlite3 is
 * synchronous), so no frame can slip between them; `lastSent` is still tracked
 * per subscriber so a duplicate is dropped rather than double-rendered.
 */
export class LedgerStreamHub implements FramePublisher {
  private readonly subscribers = new Set<Subscriber>();

  constructor(
    private readonly reader: SqliteEventReader,
    private readonly logger: Logger,
    private readonly heartbeatMs: number = HEARTBEAT_MS,
  ) {}

  publish(frames: readonly LedgerFrame[]): void {
    if (frames.length === 0 || this.subscribers.size === 0) {
      return;
    }
    for (const subscriber of this.subscribers) {
      this.pushTo(subscriber, frames);
    }
    this.logger.debug("sse.published", {
      frames: frames.length,
      subscribers: this.subscribers.size,
      first_seq: frames[0]?.id ?? null,
      last_seq: frames[frames.length - 1]?.id ?? null,
    });
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  /** Drains every client so the HTTP server can stop with no open sockets. */
  closeAll(): void {
    for (const subscriber of [...this.subscribers]) {
      subscriber.close();
    }
    this.subscribers.clear();
  }

  open(lastEventId: number | null): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let subscriber: Subscriber | null = null;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        subscriber = this.attach(controller, encoder, lastEventId);
      },
      cancel: () => {
        this.detach(subscriber, lastEventId);
      },
    });
  }

  private attach(
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    lastEventId: number | null,
  ): Subscriber {
    const heartbeat = setInterval(() => {
      safeSend(controller, encoder, ": hb\n\n");
    }, this.heartbeatMs);
    heartbeat.unref();
    const subscriber: Subscriber = {
      send: (chunk) => safeSend(controller, encoder, chunk),
      close: () => {
        clearInterval(heartbeat);
        closeQuietly(controller);
      },
      heartbeat,
      lastSent: lastEventId ?? 0,
    };
    this.subscribers.add(subscriber);
    this.backfill(subscriber, lastEventId);
    return subscriber;
  }

  private detach(subscriber: Subscriber | null, lastEventId: number | null): void {
    if (subscriber !== null) {
      clearInterval(subscriber.heartbeat);
      this.subscribers.delete(subscriber);
    }
    this.logger.info("sse.client", {
      action: "disconnect",
      last_event_id: lastEventId,
      subscribers: this.subscribers.size,
    });
  }

  private backfill(subscriber: Subscriber, lastEventId: number | null): void {
    const resumed = lastEventId !== null;
    const frames = resumed
      ? this.reader.framesAfter(lastEventId, BACKFILL_LIMIT)
      : [];
    this.pushTo(subscriber, frames);
    this.logger.info("sse.client", {
      action: resumed ? "resume" : "connect",
      last_event_id: lastEventId,
      subscribers: this.subscribers.size,
    });
  }

  private pushTo(subscriber: Subscriber, frames: readonly LedgerFrame[]): void {
    for (const frame of frames) {
      if (frame.id > subscriber.lastSent) {
        subscriber.lastSent = frame.id;
        subscriber.send(frameChunk(frame));
      }
    }
  }
}

/** A client that vanished mid-write must not take the publisher down. */
function safeSend(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  chunk: string,
): void {
  try {
    controller.enqueue(encoder.encode(chunk));
  } catch {
    // The socket is gone; `cancel` has already been scheduled.
  }
}

function closeQuietly(
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  try {
    controller.close();
  } catch {
    // Already closed by the peer.
  }
}
