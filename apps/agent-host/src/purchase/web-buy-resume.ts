import type { BeatHub } from "../http/beat-hub.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { WebTrail } from "../browser/web-trail.js";
import { resumeErrandFor } from "./web-buy-errand.js";
import { STILL_THEIRS } from "./web-buy-copy.js";
import type { WebPickPark } from "./web-pick-park.js";
import type { Spoken } from "./web-pick-close.js";
import type { PurchaseResult } from "./purchase-result.js";
import { emptyResult } from "./purchase-result.js";
import type { WindowStage } from "./window-stage.js";

export interface ResumeParts {
  readonly park: WebPickPark;
  readonly stage: WindowStage;
  readonly sandbox: { theirs(): boolean };
  readonly progress: WebProgress;
  readonly trail: WebTrail;
  readonly findings: WebFindings;
  readonly currency: string;
  readonly hub: BeatHub;
  errand(
    prompt: string,
    stated: readonly string[],
    replyLanguage: string | null,
  ): Promise<Spoken>;
  close(
    base: PurchaseResult,
    ref: string,
    from: number,
    said: Spoken,
  ): PurchaseResult;
  refuse(base: PurchaseResult, line: string, why: string): PurchaseResult;
}

/** The resumed half of a parked pick: same window, same step, no re-open
 *  and no re-sign - the covenant that parked it is still the one bound. */
export async function resumePick(
  parts: ResumeParts,
  stated: readonly string[],
  replyLanguage: string | null,
): Promise<PurchaseResult> {
  const ref = parts.park.held ?? "";
  parts.stage.reveal();
  const base = emptyResult(`urn:covenant:pick:${ref}:resumed`, ref);
  // Their turn is still theirs: an errand now would be refused by the
  // state machine and throw the basket away over a slightly early line.
  if (parts.sandbox.theirs()) {
    return parts.refuse(base, STILL_THEIRS, "web_pick_waiting");
  }
  parts.progress.resumeReset();
  const from = parts.trail.length;
  const holds = parts.findings.find(ref)?.title ?? null;
  const said = await parts.errand(
    resumeErrandFor(stated, parts.currency, parts.park.reason, replyLanguage, holds),
    stated,
    replyLanguage,
  );
  return parts.close(base, ref, from, said);
}
