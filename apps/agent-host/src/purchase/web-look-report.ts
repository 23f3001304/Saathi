import type { WebListingView } from "../browser/web-listing.js";
import type { BeatHub } from "../http/beat-hub.js";
import { LANGUAGE_SLIPPED } from "./language-gate.js";
import type { ErrandRun } from "./errand-run.js";
import {
  CUT_SHORT,
  NOTHING_OPENED,
  provenance,
  RAN_LONG,
} from "./web-look-copy.js";
import { webOptionRows } from "./web-options.js";

export interface ReportRequest {
  readonly errand: ErrandRun;
  /** Where the window actually went — `WebTrail`, not the model's account. */
  readonly opened: readonly string[];
  /** Every product tile that window was shown this errand. */
  readonly found: readonly WebListingView[];
  readonly query: string;
}

/**
 * The closing line is the harness speaking, not the agent, so it goes out as a
 * system statement beside the refusals in `cart-step.ts` rather than welded
 * onto the end of a sentence the model wrote — which in a Hindi session put an
 * English clause into the agent's own mouth. It is still English; the
 * harness's safety copy needs translating, which is not done here.
 */
function emit(hub: BeatHub, text: string, harness: boolean): void {
  hub.emit(
    harness
      ? { kind: "message", text, variant: "system" }
      : { kind: "message", text },
  );
}

/** How many cards went out, so the closing line can only promise what is
 *  actually on the screen underneath it. */
function offer(
  hub: BeatHub,
  found: readonly WebListingView[],
  query: string,
): number {
  const options = webOptionRows(found, query);
  if (options.length > 0) {
    hub.emit({ kind: "options", options });
  }
  return options.length;
}

/** The agent's own sentence where there is one; otherwise the harness says
 *  what happened, in its own voice and marked as its own. */
function closingLine(errand: ErrandRun): string {
  if (errand.told !== "") return errand.told;
  return errand.expired ? RAN_LONG : CUT_SHORT;
}

/**
 * The findings, and only where a page was actually reached: the model's own
 * sentence, then the cards, then the harness's provenance line under them — so
 * the line saying a page price is not a signed quote sits directly beneath the
 * prices it is about. Nothing is offered on a turn that opened nothing.
 */
export function reportFindings(
  hub: BeatHub,
  request: ReportRequest,
): readonly string[] {
  if (request.opened.length === 0) {
    emit(hub, NOTHING_OPENED, true);
    return [NOTHING_OPENED];
  }
  // Marked as the harness's only when it *is* the harness's: the agent's own
  // sentence is the agent's, and a fallback in its place must not be dressed
  // up as one.
  const said = closingLine(request.errand);
  emit(hub, said, request.errand.told === "");
  if (request.errand.slipped) emit(hub, LANGUAGE_SLIPPED, true);
  const offered = offer(hub, request.found, request.query);
  const closing = provenance(request.opened, offered);
  emit(hub, closing, true);
  return [said, closing];
}
