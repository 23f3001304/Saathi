import type { Logger } from "@covenant/domain";

import { NotYourWindowError } from "./browser-errors.js";
import { IdleWatch } from "./idle-watch.js";

/**
 * Which window is open, and whether anyone is still driving it.
 *
 * Two questions that turn out to be the same bookkeeping. The session key
 * agent-host mints at boot outlives any number of sandbox sessions, so it
 * cannot say *which* container a caller means; the id here can. And a caller
 * that has stopped arriving at all is the signal that the window should go.
 */
export class SessionBinding {
  private id: string | null = null;
  private readonly idle: IdleWatch;

  /**
   * `held` is the one veto over the idle sweep: a window paused on something
   * only a person can do — a sign-in, a payment step, a bot check — must not be
   * taken away while they are doing it. Somebody reading a challenge is
   * "nobody" to a watcher count, and reaping the window there would throw away
   * the basket and the pause together.
   */
  constructor(
    private readonly logger: Logger,
    close: () => void,
    held: () => boolean = () => false,
  ) {
    this.idle = new IdleWatch(() => {
      if (held()) {
        this.logger.info("browser.idle.held", { session: this.id });
        this.idle.start();
        return;
      }
      this.logger.warn("browser.idle.closed", { session: this.id });
      close();
    });
  }

  get openSessionId(): string | null {
    return this.id;
  }

  opened(id: string): void {
    this.id = id;
    this.idle.start();
  }

  closed(): void {
    this.id = null;
    this.idle.stop();
  }

  /** Any sign of life: an agent action, a route call, a relayed keystroke. */
  touch(): void {
    this.idle.touch();
  }

  /** An open frame stream. The returned function is the detach. */
  watch(): () => void {
    return this.idle.watch();
  }

  /**
   * Refuses a call aimed at a window that has since been replaced. A request
   * carrying no id is left alone, so a curl against a fresh host still works;
   * one naming the wrong window is refused rather than quietly re-aimed.
   */
  assertBoundTo(asked: string | null): void {
    if (asked !== null && asked !== this.id) {
      throw new NotYourWindowError(asked, this.id);
    }
    this.touch();
  }
}
