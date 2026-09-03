import type { Logger } from "@covenant/domain";

import type { WebProgress } from "../browser/web-progress.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { ParkReason, WebPickPark } from "./web-pick-park.js";

/** What the errand ended up saying: its own sentence, or nothing. */
export interface Spoken {
  readonly told: string;
  /** The errand ran past its wall clock. The fact reached the model as
   *  data; it is kept here for the log. */
  readonly expired: boolean;
}

export interface CloseParts {
  readonly hub: BeatHub;
  readonly park: WebPickPark;
  readonly progress: WebProgress;
  readonly logger: Logger;
}

export interface CloseRequest {
  readonly base: PurchaseResult;
  readonly ref: string;
  readonly spoke: Spoken;
}

export function emitLine(hub: BeatHub, text: string): string {
  hub.emit({ kind: "message", text });
  return text;
}

export function settleAs(
  hub: BeatHub,
  base: PurchaseResult,
  transcript: readonly string[],
  detail: string,
): PurchaseResult {
  hub.emit({ kind: "outcome", state: "answered", txnId: null, detail });
  return { ...base, status: "answered", transcript };
}

/** The outcome detail code: a park is named by what it waits on. */
export function detailOf(asking: boolean, waiting: boolean): string {
  if (asking) return "web_pick_address";
  return waiting ? "web_pick_waiting" : "web_pick";
}

/**
 * A parked checkout is owed an answer, so what the errand said goes out as a
 * question rather than as one more line in a transcript nobody can act on.
 *
 * DECISION: the prompt is the errand's own sentence. The harness used to ask
 * "Is it correct? Say yes and I will carry on" and "Tell me the code" in its
 * own fixed English, with fixed reply chips, whatever language the checkout
 * was in. The summary leg is told to name the address and ask, and its words
 * are the ask; an errand that said nothing parks on an empty prompt, and the
 * composer's placeholder stands in.
 */
function askAt(
  hub: BeatHub,
  ref: string,
  why: ParkReason,
  prompt: string,
): string {
  hub.emit({
    kind: "question",
    questionId: `urn:covenant:ask:${why}:${ref}`,
    prompt,
    replies: [],
    groups: [],
  });
  return prompt;
}

/** Why a checkout stands still, decided from what this host watched. */
function parkReasonOf(progress: WebProgress): ParkReason | null {
  // Observed, not claimed: the host itself saw a code box stand after its
  // own sign-in, filled a form the shopper has not agreed to, or handed the
  // window to a door only they can open.
  if (progress.awaitsCode) return "code";
  if (progress.awaitsAddress) return "address";
  return progress.resumable ? "handback" : null;
}

/**
 * How a picked errand ends, decided from what this host watched rather than
 * from what the errand said. A park holds the window and asks; anything else
 * releases it. Either way the only words are the errand's: no closing line
 * names the clock, the basket or the payment step in the harness's voice,
 * because every one of those facts went to the model before it spoke.
 */
export function closePick(
  parts: CloseParts,
  request: CloseRequest,
): PurchaseResult {
  const { hub, park, progress } = parts;
  const why = parkReasonOf(progress);
  const told = request.spoke.told;
  const said: string[] = [];
  if (why !== null) {
    park.hold(request.ref, why);
    said.push(askAt(hub, request.ref, why, told));
  } else {
    park.release();
    if (told !== "") said.push(emitLine(hub, told));
  }
  parts.logger.info("purchase.web_pick.close", {
    ref: request.ref,
    parked: park.parked ? park.reason : null,
    filled: progress.filled.length,
    carted: progress.carted,
    handed: progress.handedOver,
    expired: request.spoke.expired,
  });
  return settleAs(
    hub,
    request.base,
    said,
    detailOf(progress.awaitsAddress, progress.resumable),
  );
}
