import type { GuardedPage } from "../drive/guarded-page.js";
import type { PointActions } from "../drive/point-actions.js";
import type { SignInDrive } from "../drive/sign-in.js";
import type { UserInput } from "../drive/user-input.js";
import type { FinalReview } from "../drive/final-review.js";
import type { Capture } from "../frame/frame-capture.js";
import type { LiveCast } from "../frame/screencast.js";
import { DEFAULT_HANDOFF_CONFIG } from "../handoff/handoff-controller.js";
import type { HandoffController } from "../handoff/handoff-controller.js";
import type { JournalEvent } from "../journal.js";
import type { FieldSnapshot, Sandbox } from "../ports.js";
import { SessionStateError, SessionStateMachine } from "../session-state.js";
import type { SessionState } from "../session-state.js";
import { NATIVE_ENTRY_SENTENCE } from "../drive/user-input.js";
import { ownBrowserHandoff } from "../surface.js";
import type { HandoffTarget, SessionSurface } from "../surface.js";
import type { Live, SessionDeps } from "./session-parts.js";
import { assembleLive } from "./session-parts.js";

export const DEFAULT_WINDOW = { width: 1280, height: 900 } as const;

/**
 * Owns one visible Chrome window and the collaborators bound to its lifetime.
 * Control over that window is split three ways and the split is structural:
 * `page()` is the agent's surface and only works in `agent-drive`, `input()` is
 * the relay's and only works in `user-drive`, and `screenshot()` is neither —
 * looking is not driving, so it is ungated and always redacted.
 */
export class BrowserSession {
  private readonly state = new SessionStateMachine();
  private live: Live | null = null;

  constructor(private readonly deps: SessionDeps) {}

  currentState(): SessionState {
    return this.state.current();
  }

  async launch(): Promise<GuardedPage> {
    if (this.live !== null) {
      throw new SessionStateError(this.state.current(), "agent-drive");
    }
    const sandbox = this.deps.sandboxes.create(this.deps.config.sessionId);
    const browser = await this.deps.launcher.launch({
      userDataDir: sandbox.path,
      downloadDir: sandbox.downloadDir,
      surface: this.deps.config.surface,
      windowWidth: this.deps.config.windowWidth,
      windowHeight: this.deps.config.windowHeight,
    });
    this.state.transition("agent-drive");
    this.live = assembleLive(this.deps, this.state, browser, sandbox);
    this.recordLaunch(sandbox);
    return this.live.page;
  }

  page(): GuardedPage {
    return this.required().page;
  }

  /** The relay's surface. Refuses everything the agent's surface refuses. */
  input(): UserInput {
    return this.required().input;
  }

  /** The agent's aim-by-point surface; every point is judged at hit-test. */
  points(): PointActions {
    return this.required().points;
  }

  /** The vault's hands; no model reads a value that passes through here. */
  signIn(): SignInDrive {
    return this.required().signIn;
  }

  url(): string {
    return this.required().driven.url();
  }
  navigations(): number {
    return this.required().driven.navigations();
  }

  /** Where this window is: a process on the desktop, or a container. */
  surface(): SessionSurface {
    return this.required().browser.surface;
  }

  /** The container holding this window, or `"in-process"`. */
  sandboxId(): string {
    return this.required().browser.sandboxId;
  }

  /** A PNG of the window with every sensitive field already blanked, or a
   *  blackout when a protected field holds focus and no picture was taken. */
  screenshot(): Promise<Capture> {
    return this.required().frames.capture();
  }

  /**
   * The push half of watching, with its guard, or `null` where this surface
   * has none and the polled shutter is the only way to see the window.
   * Ungated for the same reason `screenshot()` is: watching is not driving.
   */
  screencast(): LiveCast | null {
    return this.live?.cast ?? null;
  }

  /** The boxes the redactor works from — the same read, exposed for callers
   * that need to map a viewport point to a control. */
  fields(): Promise<readonly FieldSnapshot[]> {
    return this.required().driven.snapshotFields();
  }

  /** Where the user should go when this session is the wrong place to be:
   *  the desktop window raised here, or the container's URL to open in
   *  their own browser. */
  async handToUser(): Promise<HandoffTarget> {
    const live = this.required();
    const url = live.driven.url();
    if (live.browser.surface !== "native-window") {
      this.deps.journal.append(
        { kind: "handoff.pointed", url, detail: { surface: "container" } },
        this.state.current(),
        "user",
      );
      return ownBrowserHandoff(url);
    }
    await live.driven.bringToFront();
    this.deps.journal.append(
      { kind: "window.fronted", url, detail: {} },
      this.state.current(),
      "user",
    );
    return {
      surface: "native-window",
      url,
      fronted: true,
      sentence: NATIVE_ENTRY_SENTENCE,
    };
  }

  /** The append-only trail, for the host to forward into the real ledger. */
  journalEntries(): readonly JournalEvent[] {
    return this.deps.journal.entries();
  }

  handoff(): HandoffController {
    return this.required().handoff;
  }

  review(): FinalReview {
    return this.required().review;
  }

  async close(): Promise<void> {
    const live = this.live;
    if (live === null) {
      return;
    }
    this.live = null;
    this.state.transition("closed");
    this.deps.journal.append(
      { kind: "session.closed", url: null, detail: {} },
      this.state.current(),
    );
    await live.browser.close();
    live.sandbox.dispose();
  }

  private recordLaunch(sandbox: Sandbox): void {
    const live = this.required();
    this.deps.journal.append(
      {
        kind: "session.launched",
        url: null,
        detail: {
          user_data_dir: sandbox.path,
          surface: live.browser.surface,
          sandbox_id: live.browser.sandboxId,
          // Stated in the trail, not just in the docs: this window shares
          // nothing with the user's own browser and is deleted on close.
          disposable_profile: true,
          shares_user_profile: false,
          os_sandbox: "enabled",
        },
      },
      this.state.current(),
    );
  }

  private required(): Live {
    if (this.live === null) {
      throw new SessionStateError(this.state.current(), "agent-drive");
    }
    return this.live;
  }
}

export { DEFAULT_HANDOFF_CONFIG };
