import type { Clock } from "@covenant/domain";

import type { CartCovenant } from "../cart/cart-covenant.js";
import type { CartInspector } from "../cart/cart-inspector.js";
import { FinalReview } from "../drive/final-review.js";
import { GuardedPage } from "../drive/guarded-page.js";
import type { NavigationPolicy } from "../drive/navigation-policy.js";
import { PointActions } from "../drive/point-actions.js";
import { UserInput } from "../drive/user-input.js";
import type { FieldClassifier } from "../field/field-classifier.js";
import { FrameCapture } from "../frame/frame-capture.js";
import { ScreencastGuard } from "../frame/screencast.js";
import type { LiveCast } from "../frame/screencast.js";
import type { HandoffConfig } from "../handoff/handoff-controller.js";
import { HandoffController } from "../handoff/handoff-controller.js";
import type { Journal } from "../journal.js";
import type {
  BrowserLauncher,
  DrivenPage,
  LaunchedBrowser,
  Sandbox,
  SandboxFactory,
  Waiter,
} from "../ports.js";
import type { SessionStateMachine } from "../session-state.js";
import { relayPolicyFor } from "../surface.js";
import type { SessionSurface } from "../surface.js";

export interface BrowserSessionConfig {
  readonly sessionId: string;
  readonly windowWidth: number;
  readonly windowHeight: number;
  /** Which window this session asked for. The launcher refuses a mismatch. */
  readonly surface: SessionSurface;
  readonly handoff: HandoffConfig;
}

export interface SessionDeps {
  readonly launcher: BrowserLauncher;
  readonly sandboxes: SandboxFactory;
  readonly classifier: FieldClassifier;
  readonly policy: NavigationPolicy;
  readonly inspector: CartInspector;
  readonly covenant: CartCovenant;
  readonly journal: Journal;
  readonly waiter: Waiter;
  readonly clock: Clock;
  readonly config: BrowserSessionConfig;
}

/** Everything whose lifetime is one Chrome window. */
export interface Live {
  readonly browser: LaunchedBrowser;
  readonly sandbox: Sandbox;
  readonly driven: DrivenPage;
  readonly page: GuardedPage;
  readonly handoff: HandoffController;
  readonly review: FinalReview;
  /** The relay's only reach into the window. */
  readonly input: UserInput;
  /** The agent's coordinate verbs, judged by the same classifier. */
  readonly points: PointActions;
  readonly frames: FrameCapture;
  /** `null` on a surface whose page cannot push frames; the shutter still can. */
  readonly cast: LiveCast | null;
}

/**
 * DECISION: these six are `new`ed here rather than in the host's composition
 * root, because every one of them needs the `DrivenPage` that does not exist
 * until Chrome is up. Everything constructible before launch is injected
 * (§12-D); what is left is lifecycle, not policy — and the same
 * `FieldClassifier` instance is handed to the agent's guard, the relay's guard
 * and the frame redactor, so there is one policy with three consequences.
 */
/**
 * The policy is read off the browser that actually launched, not off the config
 * that asked for it: what the relay may carry depends on where the window
 * really is, and only the launcher knows that for certain.
 */
function relayFor(
  deps: SessionDeps,
  state: SessionStateMachine,
  browser: LaunchedBrowser,
  driven: DrivenPage,
): UserInput {
  return new UserInput(
    driven,
    deps.classifier,
    state,
    deps.journal,
    relayPolicyFor(browser.surface),
  );
}

/**
 * The guard is built even where there is no caster to feed it, and then
 * discarded with it: a guard without a pipe judges nothing, and a pipe without
 * a guard is the thing this package exists to not have.
 */
function castOf(
  driven: DrivenPage,
  deps: SessionDeps,
  state: SessionStateMachine,
): LiveCast | null {
  const caster = driven.caster();
  if (caster === null) return null;
  return {
    caster,
    guard: new ScreencastGuard(driven, deps.classifier, () => state.current()),
  };
}

function pointsFor(
  deps: SessionDeps,
  state: SessionStateMachine,
  driven: DrivenPage,
  handoff: HandoffController,
): PointActions {
  return new PointActions(driven, deps.classifier, state, deps.journal, handoff);
}

function guardedFor(
  deps: SessionDeps,
  state: SessionStateMachine,
  driven: DrivenPage,
  handoff: HandoffController,
): GuardedPage {
  return new GuardedPage(
    driven,
    deps.classifier,
    state,
    deps.journal,
    handoff,
    deps.policy,
  );
}

export function assembleLive(
  deps: SessionDeps,
  state: SessionStateMachine,
  browser: LaunchedBrowser,
  sandbox: Sandbox,
): Live {
  const driven = browser.page();
  const handoff = new HandoffController(
    state,
    deps.journal,
    driven,
    deps.classifier,
    deps.waiter,
    deps.clock,
    deps.config.handoff,
  );
  return {
    browser,
    sandbox,
    driven,
    handoff,
    page: guardedFor(deps, state, driven, handoff),
    input: relayFor(deps, state, browser, driven),
    points: pointsFor(deps, state, driven, handoff),
    frames: new FrameCapture(driven, deps.classifier, () => state.current()),
    cast: castOf(driven, deps, state),
    review: new FinalReview(
      deps.inspector,
      deps.covenant,
      handoff,
      deps.journal,
      state,
    ),
  };
}
