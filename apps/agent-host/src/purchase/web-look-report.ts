import type { ConversationResult } from "@covenant/agents";

import type { WebListingView } from "../browser/web-listing.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { ErrandRun } from "./errand-run.js";
import type { PurchaseResult } from "./purchase-result.js";
import { webOptionRows } from "./web-options.js";

export interface ReportRequest {
  readonly errand: ErrandRun;
  /** Every product tile this errand recorded. */
  readonly found: readonly WebListingView[];
}

/**
 * The findings: the model's own sentence, then the cards. Nothing else.
 *
 * DECISION (replacing the harness's closing line): the shell no longer says
 * "I could not get a page open", "that is as far as I got" or "those prices
 * are not signed quotes" in its own voice. What it knows about the errand
 * went to the model as data before the sentence was written (`observedBlock`),
 * and the card already says on its face that its price is unsigned
 * (`quoteSigned: false`, `sourceUrl`). A silent errand is a silent turn: the
 * `outcome` beat still closes it, and no fixed sentence stands in.
 */
export function reportFindings(
  hub: BeatHub,
  request: ReportRequest,
): readonly string[] {
  const told = request.errand.told;
  if (told !== "") hub.emit({ kind: "message", text: told });
  const options = webOptionRows(request.found);
  if (options.length > 0) hub.emit({ kind: "options", options });
  return told === "" ? [] : [told];
}

/** The look's outcome beat and result, off the step so the step stays
 *  under the line cap. */
export function settleLook(
  hub: BeatHub,
  base: PurchaseResult,
  transcript: readonly string[],
  conversation: ConversationResult,
): PurchaseResult {
  hub.emit({
    kind: "outcome",
    state: "answered",
    txnId: null,
    detail: "look_on_web",
  });
  return {
    ...base,
    status: "answered",
    transcript,
    blocked: conversation.blocked,
  };
}
