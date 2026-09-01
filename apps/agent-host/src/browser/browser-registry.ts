import type { BrowserSession } from "@covenant/browser-drive";
import type { IdGenerator, Logger } from "@covenant/domain";

import { BrowserService } from "./browser-service.js";
import { QUEUE_FULL_SENTENCE, waitingSentence } from "./session-capacity.js";

export interface RegistryDeps {
  readonly build: (sessionId: string) => Promise<BrowserSession>;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly cap: number;
  readonly queueLimit: number;
  /** Per-session secret. One window, one key — see `session-keys.ts`. */
  readonly mintKey: (sessionId: string) => string;
}

export interface SessionHandle {
  readonly id: string;
  readonly service: BrowserService;
  readonly openedAt: number;
}

export type OpenOutcome =
  | { readonly kind: "open"; readonly id: string; readonly key: string }
  | {
      readonly kind: "queued";
      readonly ticket: string;
      readonly position: number;
      readonly human: string;
    }
  | { readonly kind: "refused"; readonly human: string };

interface Ticket {
  readonly id: string;
  /** Set when a slot frees and this ticket is promoted; claimed by polling. */
  granted: { readonly id: string; readonly key: string } | null;
}

/**
 * Every open sandbox on this host, and the queue behind them.
 *
 * DECISION: the registry holds `BrowserService` instances rather than replacing
 * it. A service already owns exactly one window and all the bookkeeping that
 * goes with it — the idle watch, the binding, the ceiling — and that was never
 * the thing that was wrong. What was wrong is that there was one of them.
 *
 * DECISION: a cap with a queue rather than a cap with an error. A machine that
 * is full is a fact about the machine, not a failure of the request, and the
 * honest answer is a place in a line. What it must never do is open a window
 * it cannot afford, because the failure mode there is every session getting
 * slower until the renderer deaths start.
 */
export class BrowserRegistry {
  private readonly open = new Map<string, SessionHandle>();
  private readonly queue: Ticket[] = [];
  private readonly primaryService: BrowserService;

  constructor(private readonly deps: RegistryDeps) {
    this.primaryService = this.make("web_primary");
  }

  /**
   * The window the agent's own tools drive. It exists from boot and is never
   * queued: the buyer agent is not a competitor for capacity, it is the thing
   * this host is for. Nothing is launched until something calls `open()`.
   */
  primary(): BrowserService {
    return this.primaryService;
  }

  /** A conversation lane's window, in the primary's family: agent-opened,
   *  host-keyed, not in `open` — the lane cap (`laneCapFor`) bounds these. */
  agentWindow(id: string): BrowserService {
    return this.make(id);
  }

  get count(): number {
    return this.open.size;
  }

  /** Derived from this machine, not chosen — see `session-capacity.ts`. */
  get cap(): number {
    return this.deps.cap;
  }

  get waiting(): number {
    return this.queue.length;
  }

  get(id: string): SessionHandle | null {
    return this.open.get(id) ?? null;
  }

  list(): readonly { readonly id: string; readonly openedAt: number }[] {
    return [...this.open.values()].map((h) => ({
      id: h.id,
      openedAt: h.openedAt,
    }));
  }

  /** A slot if there is one, a place in the queue if there is not. */
  start(): OpenOutcome {
    if (this.open.size < this.deps.cap) {
      return this.admit();
    }
    if (this.queue.length >= this.deps.queueLimit) {
      this.deps.logger.warn("browser.registry.refused", {
        open: this.open.size,
        waiting: this.queue.length,
      });
      return { kind: "refused", human: QUEUE_FULL_SENTENCE };
    }
    const ticket: Ticket = { id: `q_${this.deps.ids.uuid()}`, granted: null };
    this.queue.push(ticket);
    return {
      kind: "queued",
      ticket: ticket.id,
      position: this.queue.length,
      human: waitingSentence(this.queue.length, this.deps.cap),
    };
  }

  /** Where a waiting caller stands, and its window once one has been given. */
  claim(ticketId: string): OpenOutcome {
    const at = this.queue.findIndex((t) => t.id === ticketId);
    if (at === -1) {
      return { kind: "refused", human: QUEUE_FULL_SENTENCE };
    }
    const ticket = this.queue[at];
    if (ticket?.granted != null) {
      this.queue.splice(at, 1);
      return { kind: "open", ...ticket.granted };
    }
    return {
      kind: "queued",
      ticket: ticketId,
      position: at + 1,
      human: waitingSentence(at + 1, this.deps.cap),
    };
  }

  async close(id: string): Promise<boolean> {
    const handle = this.open.get(id);
    if (handle === undefined) return false;
    this.open.delete(id);
    await handle.service.close();
    this.deps.logger.info("browser.registry.closed", {
      session: id,
      open: this.open.size,
    });
    this.promote();
    return true;
  }

  /** Shutdown: every window goes, and nothing is left for the next boot. */
  async closeAll(): Promise<void> {
    const all = [...this.open.keys()];
    this.queue.length = 0;
    await Promise.all(all.map((id) => this.close(id)));
    await this.primaryService.close();
  }

  private admit(): OpenOutcome {
    const id = `web_${this.deps.ids.uuid()}`;
    const service = this.make(id);
    this.open.set(id, { id, service, openedAt: Date.now() });
    const key = this.deps.mintKey(id);
    this.deps.logger.info("browser.registry.opened", {
      session: id,
      open: this.open.size,
      cap: this.deps.cap,
    });
    return { kind: "open", id, key };
  }

  /** A freed slot goes to the front of the line, not to whoever asks next. */
  private promote(): void {
    const next = this.queue.find((t) => t.granted === null);
    if (next === undefined || this.open.size >= this.deps.cap) return;
    const admitted = this.admit();
    if (admitted.kind !== "open") return;
    next.granted = { id: admitted.id, key: admitted.key };
  }

  /**
   * Each session closes itself out of the registry when its idle watch fires,
   * so an abandoned tab frees a slot for the queue rather than holding one to
   * the container's own thirty-minute ceiling.
   */
  private make(id: string): BrowserService {
    return new BrowserService({
      build: this.deps.build,
      ids: { uuid: () => id.replace(/^web_/, "") },
      logger: this.deps.logger,
      onReaped: () => {
        if (this.open.delete(id)) this.promote();
      },
    });
  }
}
