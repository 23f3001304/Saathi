import type {
  ActionResult,
  BrowserSession,
  Capture,
  CovenantBounds,
  GuardedPage,
  HandoffTarget,
  NavigationOutcome,
} from "@covenant/browser-drive";
import type { IdGenerator, Logger } from "@covenant/domain";

import { look, lookFields, lookFrame } from "./browser-look.js";
import { sessionView } from "./browser-view.js";
import type { BrowserSessionView } from "./browser-view.js";
import type { FieldView } from "./field-view.js";
import { relayInto } from "./relay-dispatch.js";
import type { RelayRequest, RelayResponse } from "./relay-input.js";
import { SessionBinding } from "./session-binding.js";
import { WindowOwner } from "./window-owner.js";
import { WindowPhase } from "./window-phase.js";
import { handBack, handOver, takeOver } from "./wheel-ops.js";
import { NotYourTurnError } from "./browser-errors.js";

export { NotYourTurnError, NotYourWindowError } from "./browser-errors.js";

export interface BrowserServiceDeps {
  readonly build: (sessionId: string) => Promise<BrowserSession>;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  /** Fired only by the idle reap. */
  readonly onReaped?: () => void;
}

/**
 * One sandbox window at a time, owned by the host rather than by a request.
 *
 * DECISION: the frame path and the relay path share this object but not a
 * gate. `frame()` works in any state because watching is not driving; the
 * relay is refused outside `user-drive` by the package itself. The ceiling is
 * the *signed* intent's, pushed in by the run rather than read from config — a
 * window opened before any covenant was signed has no ceiling at all.
 */
export class BrowserService {
  private session: BrowserSession | null = null;
  /** What the run says about this window: shown or not, still needed or not.
   *  Public because it *is* the `WindowStage` port the turn steps hold — the
   *  object whose whole job is that question, rather than three delegations
   *  through the object whose job is the window's lifetime. */
  readonly phase = new WindowPhase();
  readonly owner = new WindowOwner();
  private bounds: CovenantBounds | null = null;
  private readonly bound: SessionBinding;

  constructor(private readonly deps: BrowserServiceDeps) {
    this.bound = new SessionBinding(
      deps.logger,
      () => this.reap(),
      () => this.phase.busy || this.session?.currentState() === "user-drive",
    );
  }

  /** Reaped, not merely closed: a registry hooked to every close would evict
   *  a session as `relaunch()` hands it one. */
  private reap(): void {
    void this.close().then(this.deps.onReaped);
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  /** Echoed back on every call: the key says "this host trusts you", the id
   *  says "and this is the window". Both must hold. */
  get openSessionId(): string | null {
    return this.bound.openSessionId;
  }

  /** An open frame stream. The returned function is the detach. */
  watch(): () => void {
    return this.bound.watch();
  }

  assertBoundTo(asked: string | null): void {
    this.bound.assertBoundTo(asked);
  }

  /** The ceiling the signed Intent Mandate set; `null` until it is. */
  get ceiling(): CovenantBounds | null {
    return this.bounds;
  }

  bindCeiling(bounds: CovenantBounds | null): void {
    this.bounds = bounds;
    this.deps.logger.info("browser.ceiling.bound", {
      cap_paise: bounds?.capPaise ?? null,
    });
  }

  /** The live session, for the tools that drive it. */
  current(): BrowserSession | null {
    this.bound.touch();
    return this.session;
  }

  /** Opens, launching if needed. An open window is navigated, never replaced —
   *  a relaunch would discard its cart. */
  async open(url: string): Promise<ActionResult<NavigationOutcome>> {
    const page = this.session === null ? await this.relaunch() : this.page();
    const landed = await page.navigate(url);
    this.deps.logger.info("browser.opened", { url, allowed: landed.ok });
    return landed;
  }

  /** The agent's guarded surface on the live window. */
  page(): GuardedPage {
    return this.required().page();
  }
  /** A fresh window, replacing any this service already holds. */
  restart(): Promise<GuardedPage> {
    return this.relaunch();
  }
  /** The card for the live session, for callers composing on top. */
  card(): BrowserSessionView {
    return sessionView(this.required(), this.openSessionId ?? "");
  }
  /** The end command: the run calls it when the errand finishes, the route
   *  when the Bench says so, the idle watch when nobody is left. */
  async close(): Promise<void> {
    const session = this.session;
    this.owner.release();
    this.session = null;
    this.bound.closed();
    if (session !== null) await session.close();
  }

  view(): BrowserSessionView | null {
    this.bound.touch();
    if (!this.phase.visible) return null;
    const seen = look(this.session, this.openSessionId ?? "");
    return seen === null
      ? null
      : { ...seen, conversation: this.owner.claimedBy };
  }

  frame(): Promise<Capture | null> {
    return lookFrame(this.session);
  }

  fields(): Promise<readonly FieldView[]> {
    return lookFields(this.session);
  }

  handToUser(): Promise<HandoffTarget | null> {
    this.bound.touch();
    return handOver(this.session);
  }

  takeover(): BrowserSessionView | null {
    return takeOver(this.session, this.openSessionId ?? "");
  }

  resume(): boolean {
    return handBack(this.session);
  }

  relay(request: RelayRequest): Promise<RelayResponse> {
    return relayInto(this.required(), request, () => this.handToUser());
  }

  private async relaunch(): Promise<GuardedPage> {
    await this.close();
    const id = `web_${this.deps.ids.uuid()}`;
    const session = await this.deps.build(id);
    const guarded = await session.launch();
    this.session = session;
    this.owner.stampAtBirth();
    this.bound.opened(id);
    const surface = session.surface();
    this.deps.logger.info("browser.launched", {
      session: id,
      surface,
      sandbox: session.sandboxId(),
    });
    return guarded;
  }

  private required(): BrowserSession {
    if (this.session === null) throw new NotYourTurnError("closed");
    this.bound.touch();
    return this.session;
  }
}
