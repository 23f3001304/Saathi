import type { BeatHub } from "../http/beat-hub.js";
import type { WebErrand } from "./errand-run.js";
import { sayOnly } from "./errand-run.js";
import type {
  ErrandEnd,
  ObservedFacts,
  ProgressView,
} from "./observed-block.js";
import { emptyFacts, factsFrom, observedBlock } from "./observed-block.js";
import { pickSummaryFor } from "./web-buy-errand.js";

/** What a pick errand may read about its own window. Structural: this file
 *  must not learn that a browser or a shopper object exists. */
export interface PickWatch {
  readonly trail: { since(from: number): readonly string[] };
  readonly progress: ProgressView;
  /** True while the shopper holds the wheel. */
  theirs(): boolean;
}

/**
 * The host's own record of a checkout errand. `holds` is the tapped listing's
 * title, named as the basket's content only when this host saw the click
 * land: the errand's claim that something is in the basket is not evidence.
 */
export function pickFacts(
  watch: PickWatch,
  at: { readonly from: number; readonly holds: string | null },
  ended: ErrandEnd,
): ObservedFacts {
  return factsFrom(watch.progress, {
    pages: watch.trail.since(at.from),
    basketHolds: watch.progress.carted ? at.holds : null,
    window: watch.theirs() ? "shopper" : "agent",
    expired: ended.expired,
    failure: ended.failure,
  });
}

/**
 * One turn, one sentence, on a conversation nobody left half-finished.
 *
 * `sayOnly` deliberately does not reset: the afterword `runErrand` asks for
 * has already abandoned the leg that hung. The two turns that reach it from
 * here have not, because no `runErrand` ran in front of them, so abandoning
 * is theirs to do and it has to happen immediately before the asking. Without
 * it this one sentence is appended to a previous errand's unawaited half.
 */
export async function saidAlone(
  conversation: WebErrand,
  prompt: string,
): Promise<string> {
  await conversation.reset?.().catch(() => undefined);
  return await sayOnly(conversation, prompt);
}

/** The model's own sentence about a fact this host holds alone, from a turn
 *  that drove nothing: the window it would have read never opened. */
export function pickAfterword(
  conversation: WebErrand,
  at: {
    readonly stated: readonly string[];
    readonly replyLanguage: string | null;
  },
  over: { readonly failure: string },
): Promise<string> {
  return saidAlone(
    conversation,
    pickSummaryFor(
      at.stated,
      at.replyLanguage,
      observedBlock(emptyFacts(over)),
    ),
  );
}

/** What the errand said, said once, in its own voice. Nothing when it never
 *  spoke: a silent turn closes on its outcome beat alone. */
export function spokenBy(hub: BeatHub, told: string): readonly string[] {
  if (told === "") return [];
  hub.emit({ kind: "message", text: told });
  return [told];
}
