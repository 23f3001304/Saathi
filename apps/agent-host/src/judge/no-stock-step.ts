import type { TurnPlan } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";
import type { WebOffered } from "../purchase/web-offered.js";
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

/** Why the streamed draft above it went. The model wrote that it was
 *  getting a purchase ready before anything had read the shelf. */
export const SPOKE_TOO_SOON = "this shop does not stock it";

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
  // Said before anything read the shelf, and contradicted by what it found.
  parts.drafts?.withdrawLast(SPOKE_TOO_SOON);
  parts.logger.info("purchase.not_stocked", { run_id: base.runId });
  // DECISION (replacing two canned transitions): the errand speaks, always.
  // A fixed "this shop doesn't stock that" surfaced in conversations where
  // it answered nothing, and a fixed re-present of old cards answered
  // "none of these" with the same four cards. The errand's known block
  // carries everything this conversation already found, so the model can
  // answer from it without opening a page, offer it again when that is
  // right, or search fresh when the newest line asks: its judgement, in
  // the shopper's own language, instead of the harness's English.
  const looked = await parts.webLook.look(
    base,
    lookPlan(request),
    linesOf(request),
  );
  return looked;
}

function linesOf(request: string): readonly string[] {
  return request.split("\n").filter((line) => line.trim().length > 0);
}
