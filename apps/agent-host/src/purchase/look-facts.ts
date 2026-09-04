import type { WebFindings } from "../browser/web-listing.js";
import type { WebTrail } from "../browser/web-trail.js";
import type {
  ErrandEnd,
  ObservedFacts,
  ProgressView,
} from "./observed-block.js";
import { factsFrom, windowOwnerOf } from "./observed-block.js";
import { cardedListings } from "./web-options.js";


/** What a look may read about the window it does not drive: a checkout parked
 *  from an earlier turn is still a fact about their screen. It lives here
 *  because this is the only thing that reads it. */
export interface LookWatch {
  readonly progress: ProgressView;
  readonly window: { current(): { currentState(): string } | null };
}

export interface FactParts {
  readonly trail: WebTrail;
  readonly findings: WebFindings;
  readonly watch: LookWatch | null;
}

/**
 * The host's own record of an errand, for the model to speak from.
 *
 * Every read is optional-chained: this runs on a window that may have just
 * gone, and gathering facts must not be what ends the errand. Its own file
 * because it is a reading of what the host watched, and `WebLookStep` is the
 * thing that runs the errand - they were together only because one called the
 * other.
 */
export function lookFacts(
  parts: FactParts,
  from: number,
  seen: number,
  ended: ErrandEnd,
): ObservedFacts {
  const state = parts.watch?.window.current()?.currentState() ?? null;
  return factsFrom(parts.watch?.progress ?? null, {
    pages: parts.trail.since(from),
    cards: cardedListings(parts.findings.since(seen)).length,
    window: windowOwnerOf(state),
    expired: ended.expired,
    failure: ended.failure,
  });
}
