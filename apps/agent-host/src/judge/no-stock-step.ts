import type { TurnPlan } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";
import type { WebOffered } from "../purchase/web-offered.js";
import { optionRowsFor } from "../purchase/web-options.js";
import type { WebLook } from "../purchase/web-look-step.js";

export interface NoStockParts {
  readonly hub: BeatHub;
  readonly webLook: WebLook;
  readonly logger: Logger;
  /** What this conversation has already been shown on the open web. */
  readonly offered: WebOffered;
  /** Which conversation this is: cards belong to one. */
  readonly chat: string | null;
  /** Where a streamed answer went, so one the shelf contradicts can be taken
   *  back off the screen. */
  readonly drafts: { withdrawLast(reason: string): void } | null;
}

/**
 * The harness's safety copy for a shop that does not sell the thing.
 *
 * DECISION: a `system` beat, beside the refusals in `cart-step.ts`, and never
 * welded onto a sentence the model wrote. The model's `reply` for this turn was
 * composed while it still believed it was buying, so it cannot be trusted to
 * carry the refusal — and appending harness English to the end of an agent's
 * Hindi sentence is the exact bug `browse-step.ts` records. It is still
 * English; the harness's safety copy needs translating, which is not done here.
 */
export const NOT_STOCKED =
  "This shop doesn't stock that, so let me look on the open web for you " +
  "instead. Give me a minute to read a few pages; nothing is bought or " +
  "signed while I look.";

/** Why the sentence above it went. The model wrote that it was getting a
 *  purchase ready before anything had read the shelf. */
export const SPOKE_TOO_SOON = "this shop does not stock it";

/**
 * The shop cannot serve it — and this conversation has already been shown
 * things that can.
 *
 * DECISION: re-present rather than research again. Every `draft_intent` on a
 * two-item demo shelf lands here, so a shopper saying "OK" to an errand's own
 * findings was answered with a brand-new errand from scratch, which wandered
 * off and found nothing. What they asked for is on their screen; the honest
 * move is to point at it, not to go and look for it a second time.
 */
export const ALREADY_FOUND =
  "This shop doesn't stock that, but what I found for you on the open web is " +
  "still here. Pick one and I'll take it forward in that shop's own window; " +
  "nothing is signed until you say so.";

/** The errand, built by the harness so the query is the thing the catalog was
 *  actually asked for and not a phrase the model wrote after the fact. */
function lookPlan(query: string): TurnPlan {
  return {
    action: "look_on_web",
    reply: "",
    question: null,
    query,
    amendment: null,
    traits: [],
  };
}

/**
 * A purchase turn the shop cannot serve.
 *
 * It is terminal and it signs nothing: no intent is drafted, no mandate is
 * issued and no quote is asked for, because the thing to name in them does not
 * exist. What happens instead is that the shopper is told, and then the open
 * web is tried — `WebLookStep` reports only from where the window actually
 * landed, so a look that reaches no page says so rather than inventing one.
 *
 * The run ends `answered`. A shopper asking for something this shop does not
 * stock has had their question handled, and calling that `failed` would put a
 * stack-trace shape on an ordinary conversation.
 */
export async function noStockTurn(
  parts: NoStockParts,
  base: PurchaseResult,
  request: string,
): Promise<PurchaseResult> {
  // Said before anything read the shelf, and contradicted by the next bubble.
  parts.drafts?.withdrawLast(SPOKE_TOO_SOON);
  parts.logger.info("purchase.not_stocked", { run_id: base.runId });
  const already = parts.offered.live(parts.chat);
  if (already.length > 0) {
    return represent(parts, base, already.length);
  }
  parts.hub.emit({ kind: "message", text: NOT_STOCKED, variant: "system" });
  // `NothingStocked` carries the shopper's own half of the conversation, which
  // is what the errand needs to know which language to answer in. Handing over
  // only `base.request` left it with whatever they typed last — "50,000rs" —
  // and a fragment that is written in no language at all got answered in one
  // the shopper had never used.
  const looked = await parts.webLook.look(
    base,
    lookPlan(request),
    linesOf(request),
  );
  return { ...looked, transcript: [NOT_STOCKED, ...looked.transcript] };
}

/** The cards this conversation already has, put back in front of them. */
function represent(
  parts: NoStockParts,
  base: PurchaseResult,
  shown: number,
): PurchaseResult {
  parts.hub.emit({ kind: "message", text: ALREADY_FOUND, variant: "system" });
  parts.hub.emit({
    kind: "options",
    options: optionRowsFor(parts.offered.live(parts.chat)),
  });
  parts.hub.emit({
    kind: "outcome",
    state: "answered",
    txnId: null,
    detail: "not_stocked_offered",
  });
  parts.logger.info("purchase.not_stocked.offered", { shown });
  return { ...base, status: "answered", transcript: [ALREADY_FOUND] };
}

function linesOf(request: string): readonly string[] {
  return request.split("\n").filter((line) => line.trim().length > 0);
}
