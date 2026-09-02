import type { Logger } from "@covenant/domain";

import type { WebProgress } from "../browser/web-progress.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "./purchase-result.js";
import {
  ADDRESS_REPLIES,
  ASK_CODE,
  closing,
  CODE_REPLIES,
  CONFIRM_ADDRESS,
  detailOf,
  endedWith,
  HANDED,
} from "./web-buy-copy.js";
import type { WebPickPark } from "./web-pick-park.js";

/**
 * What the errand ended up saying — its own sentence, or nothing.
 *
 * DECISION: the harness's fallbacks are not smuggled in here as though the
 * errand had said them. An errand that never spoke used to have `STOPPED`
 * emitted in the agent's own voice, and then the closing system line said the
 * same sentence again one bubble later: the shopper read the identical words
 * twice, once wearing the wrong face. `told` is now only ever the errand's
 * own prose; what the harness says about a silent errand is the closing
 * line's, said once and marked as the harness's.
 */
export interface Spoken {
  readonly told: string;
  /** The errand ran past its wall clock: the closing names the clock. */
  readonly expired: boolean;
}

export interface CloseParts {
  readonly hub: BeatHub;
  readonly park: WebPickPark;
  readonly progress: WebProgress;
  readonly trail: WebTrail;
  readonly logger: Logger;
}

export interface CloseRequest {
  readonly base: PurchaseResult;
  readonly ref: string;
  /** Where `WebTrail` stood when this errand began. */
  readonly from: number;
  readonly spoke: Spoken;
  readonly fallback?: string;
}

export function emitLine(hub: BeatHub, text: string, harness: boolean): string {
  hub.emit(
    harness
      ? { kind: "message", text, variant: "system" }
      : { kind: "message", text },
  );
  return text;
}

/** A parked checkout is owed an answer, so it goes out as a question rather
 *  than as one more system line in a transcript nobody can act on. */
function askCodeAt(hub: BeatHub, ref: string): string {
  hub.emit({
    kind: "question",
    questionId: `urn:covenant:ask:code:${ref}`,
    prompt: ASK_CODE,
    replies: [...CODE_REPLIES],
    groups: [],
  });
  return ASK_CODE;
}

function askAt(hub: BeatHub, ref: string): string {
  hub.emit({
    kind: "question",
    questionId: `urn:covenant:ask:address:${ref}`,
    prompt: CONFIRM_ADDRESS,
    replies: [...ADDRESS_REPLIES],
    groups: [],
  });
  return CONFIRM_ADDRESS;
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

/** The errand's own sentence when it has one. Nothing when it never spoke: a
 *  silent errand is the harness's to explain, in its own marked voice, not a
 *  fallback wearing the agent's. */
function spoken(hub: BeatHub, spoke: Spoken): readonly string[] {
  return spoke.told === "" ? [] : [emitLine(hub, spoke.told, false)];
}

/**
 * How a picked errand ends, decided from what this host watched rather than
 * from what the errand said: a delivery form filled and the window still the
 * agent's means it stands at an address nobody agreed to, so it parks and
 * asks. A door only the shopper can open parks too — that is what makes "tell
 * me when you are through" true, because the window is held and their next
 * sentence resumes rather than starting fresh. Anything else is done, the
 * park is released, and the closing line names what was actually observed:
 * an expiry, an empty basket, or a checkout standing at the payment step.
 */
export function closePick(
  parts: CloseParts,
  request: CloseRequest,
): PurchaseResult {
  const { hub, park, progress } = parts;
  const asking = progress.awaitsAddress;
  const waiting = progress.resumable;
  const said = [...spoken(hub, request.spoke)];
  if (progress.awaitsCode) {
    // Observed, not claimed: the host itself saw a code box stand after its
    // own sign-in, so the checkout is held and the shopper owed the ask.
    park.hold(request.ref, "code");
    said.push(askCodeAt(hub, request.ref));
  } else if (asking) {
    park.hold(request.ref, "address");
    said.push(askAt(hub, request.ref));
  } else if (waiting) {
    park.hold(request.ref, "handback");
    if (said.length === 0) said.push(emitLine(hub, HANDED, true));
  } else {
    park.release();
    const walked = parts.trail.since(request.from);
    const tail = endedWith(
      request.spoke.expired,
      progress.carted,
      progress.handedOver === "payment",
    );
    said.push(emitLine(hub, closing(walked, request.fallback ?? "", tail), true));
  }
  parts.logger.info("purchase.web_pick.close", {
    ref: request.ref,
    parked: park.parked ? park.reason : null,
    filled: progress.filled.length,
    carted: progress.carted,
    handed: progress.handedOver,
  });
  return settleAs(hub, request.base, said, detailOf(asking, waiting));
}
