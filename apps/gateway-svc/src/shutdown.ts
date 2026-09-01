import type { Logger } from "@covenant/domain";

const POLL_MS = 25;

export const DRAIN_TIMEOUT_MS = 10_000;

/**
 * Counts in-flight verdicts and refuses new ones once draining starts
 * (ARCHITECTURE §10.4). A verdict that has already opened its transaction is
 * allowed to finish — killing it mid-flight is the one way to get a Razorpay
 * effect with no ledger event, which is the invariant the whole design is
 * built to protect.
 */
export class DrainGate {
  private inFlight = 0;
  private draining = false;

  get isDraining(): boolean {
    return this.draining;
  }

  get pending(): number {
    return this.inFlight;
  }

  enter(): void {
    this.inFlight += 1;
  }

  exit(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  begin(): void {
    this.draining = true;
  }

  async settle(timeoutMs: number = DRAIN_TIMEOUT_MS): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await sleep(POLL_MS);
    }
    return this.inFlight;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

export interface ShutdownSteps {
  /** Stop accepting new connections. */
  stopAccepting(): Promise<void>;
  /** Drop every SSE subscriber so no socket outlives the process. */
  closeStreams(): void;
  /** Flush the span batch to the collector. */
  flushTraces(): Promise<void>;
  /** Last, and only after the drain: the write handle. */
  closeDatabase(): void;
}

/**
 * Stop accepting → drain in-flight verdicts → flush spans → close the
 * database, in that order (§2.8). The database closes last because a draining
 * verdict still needs its `COMMIT`.
 */
export class GracefulShutdown {
  private started = false;

  constructor(
    private readonly gate: DrainGate,
    private readonly steps: ShutdownSteps,
    private readonly logger: Logger,
  ) {}

  async run(signal: string): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    const began = Date.now();
    this.gate.begin();
    await this.steps.stopAccepting();
    const stranded = await this.gate.settle();
    this.steps.closeStreams();
    await this.steps.flushTraces();
    this.steps.closeDatabase();
    this.logger.info("shutdown.drain", {
      signal,
      in_flight: stranded,
      ms: Date.now() - began,
    });
  }
}
