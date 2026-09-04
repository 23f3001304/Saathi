import { SWEEP_MS } from "./warm-pool-deps.js";
import type { Warm, WarmPoolDeps } from "./warm-pool-deps.js";
export * from "./warm-pool-deps.js";

/**
 * Containers started before anybody asks for one.
 *
 * DECISION: pre-launched and handed out **once**, never shared and never
 * returned. A warm container is blank - it has loaded no page and holds no
 * cookie - so binding one to a conversation on first use is the same container
 * that conversation would have got, minus the wait. What it must never be is
 * recycled: a container that has been driven holds that shopper's session, and
 * the only safe thing to do with it afterwards is end it. So `claim` removes
 * an entry for good and `prime` starts a replacement, which keeps the one
 * lifetime rule this package has always had - one container, one errand, then
 * gone - and only moves *when* the launch happens.
 *
 * Nothing here knows what a container is. The pool is lifetimes and counts;
 * Docker lives in `start` and `retire`.
 */
export class WarmContainers<T> {
  private readonly warm: Warm<T>[] = [];
  private readonly pending = new Set<Promise<void>>();
  /** Counted apart from `pending`, which also holds retirements: a container
   *  being ended is not a container on its way, and a refill that waited on
   *  one would leave the pool a slot short for as long as the stop took. */
  private starting = 0;
  private sweeper: NodeJS.Timeout | null = null;
  private drained = false;

  constructor(private readonly deps: WarmPoolDeps<T>) {}

  get ready(): number {
    return this.warm.length;
  }

  /** Fills to `size`, in the background. Safe to call as often as you like. */
  prime(): void {
    if (this.drained) return;
    this.watch();
    while (this.warm.length + this.starting < this.deps.size) {
      this.starting += 1;
      this.track(
        this.startOne().finally(() => {
          this.starting -= 1;
        }),
      );
    }
  }

  /**
   * One container, warm if there is one and cold if there is not. A pool that
   * made a caller *wait* for a warm one would be slower than no pool at all on
   * the very run that emptied it, so an empty pool is an ordinary cold launch
   * and its failure is the caller's to hear.
   */
  async claim(): Promise<T> {
    this.dropStale();
    const taken = this.warm.shift();
    this.prime();
    return taken?.held ?? (await this.deps.start());
  }

  /** Retires anything that has sat warm too long, then refills. */
  sweep(): void {
    if (this.drained) return;
    this.dropStale();
    this.prime();
  }

  private dropStale(): void {
    if (this.drained) return;
    const cutoff = this.clock() - this.deps.maxAgeMs;
    for (const entry of [...this.warm]) {
      const why = this.spent(entry, cutoff);
      if (why === null) continue;
      this.warm.splice(this.warm.indexOf(entry), 1);
      this.say("browser.warm.dropped", { why });
      this.track(this.retire(entry.held));
    }
  }

  /** Why this one may not be handed out, or `null` when it may. */
  private spent(entry: Warm<T>, cutoff: number): string | null {
    if (entry.bornAt <= cutoff) return "stale";
    return this.deps.alive?.(entry.held) === false ? "gone" : null;
  }

  /** Everything still held goes, and nothing starts after. */
  async drain(): Promise<void> {
    this.drained = true;
    if (this.sweeper !== null) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
    await this.settle();
    const held = this.warm.splice(0, this.warm.length);
    await Promise.all(held.map((entry) => this.retire(entry.held)));
  }

  /** Waits for the background work to go quiet. For tests and for `drain`. */
  async settle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  private async startOne(): Promise<void> {
    const began = this.clock();
    const held = await this.deps.start();
    // A pool drained while this was starting must not keep what it started.
    if (this.drained) {
      await this.retire(held);
      return;
    }
    this.warm.push({ held, bornAt: this.clock() });
    this.say("browser.warm.ready", {
      ready: this.warm.length,
      ms: this.clock() - began,
    });
  }

  /**
   * A launch that failed is this pool's problem and nobody else's: the next
   * claim starts one cold and reports its own failure. Swallowing it here is
   * what keeps a Docker daemon that went away from becoming an unhandled
   * rejection in a process that is otherwise still serving.
   */
  private track(work: Promise<void>): void {
    const settled = work.catch((cause: unknown) => {
      this.say("browser.warm.failed", { cause: String(cause).slice(0, 200) });
    });
    this.pending.add(settled);
    void settled.finally(() => this.pending.delete(settled));
  }

  private retire(held: T): Promise<void> {
    return this.deps.retire(held).catch(() => undefined);
  }

  private watch(): void {
    if (this.sweeper !== null) return;
    this.sweeper = setInterval(() => {
      this.sweep();
    }, SWEEP_MS);
    // Never the reason the process stays up, for the same reason `IdleWatch`
    // unrefs its own: a warm pool holding the host open is a worse bug than a
    // cold start.
    this.sweeper.unref();
  }

  private clock(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private say(event: string, detail: Record<string, unknown>): void {
    this.deps.logger?.info(event, { pool: this.deps.label ?? "warm", ...detail });
  }
}
