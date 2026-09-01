/**
 * Two minutes of nobody at all: no frame stream open, no request on the sandbox
 * routes, and no agent action reaching the window. Long enough that a slow
 * model turn between two tool calls is not mistaken for an abandoned errand,
 * short enough that a closed tab does not leave a browser running for the rest
 * of the thirty-minute ceiling.
 */
export const IDLE_GRACE_MS = 120_000;

/** How often the question is asked. Cheap; it is a subtraction. */
const SWEEP_MS = 15_000;

function graceOf(env: NodeJS.ProcessEnv): number {
  const raw = Number(env["COVENANT_BROWSER_IDLE_MS"] ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : IDLE_GRACE_MS;
}

/**
 * The answer to "who is watching this window?".
 *
 * The relay is how a human drives a containerised browser, so a container
 * nobody is attached to is a browser nobody is driving. The container's own
 * `timeout` is the ceiling and catches everything; this is the ordinary case
 * it should almost never have to catch — the tab closed, the run died, and the
 * window should go with them rather than idling for half an hour.
 */
export class IdleWatch {
  private watchers = 0;
  private lastSeen = Date.now();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onIdle: () => void,
    private readonly graceMs: number = graceOf(process.env),
  ) {}

  start(): void {
    this.stop();
    this.lastSeen = Date.now();
    this.timer = setInterval(() => {
      this.sweep();
    }, SWEEP_MS);
    // Never the reason the process stays up: an idle sweeper holding agent-host
    // open would be the same bug this class exists to prevent, one level up.
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.watchers = 0;
  }

  /** Any sign of life — an agent action, a route call, a relayed keystroke. */
  touch(): void {
    this.lastSeen = Date.now();
  }

  /** An open frame stream. The returned function is the detach. */
  watch(): () => void {
    this.watchers += 1;
    this.touch();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // Floored: `stop()` zeroes the count, so a detach that arrives after a
      // relaunch would otherwise drive it negative and veto the sweep forever.
      this.watchers = Math.max(0, this.watchers - 1);
      this.touch();
    };
  }

  get idle(): boolean {
    return this.watchers === 0 && Date.now() - this.lastSeen >= this.graceMs;
  }

  private sweep(): void {
    if (this.idle) {
      this.stop();
      this.onIdle();
    }
  }
}
