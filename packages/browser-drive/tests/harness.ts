import { CartCovenant } from "../src/cart/cart-covenant.js";
import { CartInspector } from "../src/cart/cart-inspector.js";
import { FinalReview } from "../src/drive/final-review.js";
import { GuardedPage } from "../src/drive/guarded-page.js";
import { UserInput } from "../src/drive/user-input.js";
import type { NavigationPolicyConfig } from "../src/drive/navigation-policy.js";
import {
  NavigationPolicy,
  WEB_ONLY_NAVIGATION,
} from "../src/drive/navigation-policy.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import { FrameCapture } from "../src/frame/frame-capture.js";
import { HandoffController } from "../src/handoff/handoff-controller.js";
import { CollectingJournalSink, Journal } from "../src/journal.js";
import { SessionStateMachine } from "../src/session-state.js";
import type { FakePageOptions } from "./fakes.js";
import { FakePage, FixedClock, InstantWaiter } from "./fakes.js";

export interface Rig {
  readonly page: FakePage;
  readonly guarded: GuardedPage;
  readonly journal: Journal;
  readonly sink: CollectingJournalSink;
  readonly state: SessionStateMachine;
  readonly handoff: HandoffController;
  readonly review: FinalReview;
  readonly waiter: InstantWaiter;
  readonly input: UserInput;
  readonly frames: FrameCapture;
}

export interface RigOptions extends FakePageOptions {
  readonly navigation?: NavigationPolicyConfig;
  /** The container surface's relay policy; the native surface's is the default. */
  readonly carriesSensitive?: boolean;
  readonly capPaise?: number;
  readonly accountMarkers?: readonly string[];
}

/**
 * Everything a `BrowserSession` would assemble after launch, minus Chrome. The
 * production wiring and this rig construct the same objects in the same order,
 * so a guard that passes here is the guard that ships.
 */
function guardedFor(
  options: RigOptions,
  page: FakePage,
  classifier: FieldClassifier,
  state: SessionStateMachine,
  journal: Journal,
  handoff: HandoffController,
): GuardedPage {
  return new GuardedPage(
    page,
    classifier,
    state,
    journal,
    handoff,
    new NavigationPolicy(options.navigation ?? WEB_ONLY_NAVIGATION),
  );
}

export function rig(options: RigOptions): Rig {
  const sink = new CollectingJournalSink();
  const clock = new FixedClock();
  const journal = new Journal(sink, clock, "sess_test");
  const state = new SessionStateMachine();
  const page = new FakePage(options);
  const classifier = new FieldClassifier();
  const waiter = new InstantWaiter();
  const handoff = handoffFor(
    options,
    state,
    journal,
    page,
    classifier,
    waiter,
    clock,
  );
  const guarded = guardedFor(options, page, classifier, state, journal, handoff);
  state.transition("agent-drive");
  return {
    page,
    guarded,
    input: new UserInput(page, classifier, state, journal, {
      carriesSensitive: options.carriesSensitive ?? false,
    }),
    frames: new FrameCapture(page, classifier),
    journal,
    sink,
    state,
    handoff,
    waiter,
    review: reviewFor(options, handoff, journal, state),
  };
}

function reviewFor(
  options: RigOptions,
  handoff: HandoffController,
  journal: Journal,
  state: SessionStateMachine,
): FinalReview {
  const bounds = { capPaise: options.capPaise ?? 150_000, currency: "INR" };
  return new FinalReview(
    new CartInspector(),
    new CartCovenant(bounds),
    handoff,
    journal,
    state,
  );
}

export function kinds(journal: Journal): readonly string[] {
  return journal.entries().map((event) => event.kind);
}

function handoffFor(
  options: RigOptions,
  state: SessionStateMachine,
  journal: Journal,
  page: FakePage,
  classifier: FieldClassifier,
  waiter: InstantWaiter,
  clock: FixedClock,
): HandoffController {
  return new HandoffController(
    state,
    journal,
    page,
    classifier,
    waiter,
    clock,
    {
      pollIntervalMs: 0,
      maxPolls: 5,
      accountMarkers: options.accountMarkers ?? ["a[href*='logout']"],
    },
  );
}
