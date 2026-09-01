import type { Logger } from "@covenant/domain";

import type { WebProgress } from "../browser/web-progress.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import { LANGUAGE_SLIPPED } from "./language-gate.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { ErrandRun } from "./errand-run.js";
import {
  ADDRESS_REPLIES,
  CHECKOUT_RAN_LONG,
  closing,
  CONFIRM_ADDRESS,
  detailOf,
  STOPPED,
} from "./web-buy-copy.js";
import type { WebPickPark } from "./web-pick-park.js";

/** What the errand ended up saying, and whether the harness had to admit the
 *  language was not the one they asked for. */
export interface Spoken {
  readonly told: string;
  readonly slipped: boolean;
}

/** Its own sentence, or the harness's about why there is not one. */
export function spokenBy(run: ErrandRun): string {
  if (run.told !== "") return run.told;
  return run.expired ? CHECKOUT_RAN_LONG : STOPPED;
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
function askAt(hub: BeatHub, ref: string): string {
  hub.emit({
    kind: "question",
    questionId: `urn:covenant:ask:address:${ref}`,
    prompt: CONFIRM_ADDRESS,
    replies: [...ADDRESS_REPLIES],
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

/**
 * How a picked errand ends, decided from what this host watched rather than
 * from what the errand said: a delivery form filled and the window still the
 * agent's means it stands at an address nobody agreed to, so it parks and
 * asks. A door only the shopper can open parks too — that is what makes "tell
 * me when you are through" true, because the window is held and their next
 * sentence resumes rather than starting fresh. Anything else is done, and the
 * park is released.
 */
export function closePick(
  parts: CloseParts,
  request: CloseRequest,
): PurchaseResult {
  const { hub, park, progress } = parts;
  const asking = progress.awaitsAddress;
  const waiting = progress.resumable;
  const said = [emitLine(hub, request.spoke.told, false)];
  if (request.spoke.slipped) said.push(emitLine(hub, LANGUAGE_SLIPPED, true));
  if (asking) {
    park.hold(request.ref, "address");
    said.push(askAt(hub, request.ref));
  } else if (waiting) {
    park.hold(request.ref, "handback");
  } else {
    park.release();
    const walked = parts.trail.since(request.from);
    said.push(emitLine(hub, closing(walked, request.fallback ?? ""), true));
  }
  parts.logger.info("purchase.web_pick.close", {
    ref: request.ref,
    parked: park.parked ? park.reason : null,
    filled: progress.filled.length,
    handed: progress.handedOver,
  });
  return settleAs(hub, request.base, said, detailOf(asking, waiting));
}
