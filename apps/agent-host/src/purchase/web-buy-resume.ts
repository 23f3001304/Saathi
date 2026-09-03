import type { BeatHub } from "../http/beat-hub.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { WebTrail } from "../browser/web-trail.js";
import { pickSummaryFor, resumeErrandFor } from "./web-buy-errand.js";
import { factsFrom, observedBlock } from "./observed-block.js";
import { spokenBy } from "./pick-facts.js";
import type { WebPickPark } from "./web-pick-park.js";
import type { Spoken } from "./web-pick-close.js";
import { settleAs } from "./web-pick-close.js";
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
    at: {
      readonly stated: readonly string[];
      readonly replyLanguage: string | null;
      readonly from: number;
      readonly holds: string | null;
    },
  ): Promise<Spoken>;
  /** One sentence and nothing else, for a turn that may not drive. */
  say(prompt: string): Promise<string>;
  close(base: PurchaseResult, ref: string, said: Spoken): PurchaseResult;
}

/** The resumed half of a parked pick: same window, same step, no re-open
 *  and no re-sign; the covenant that parked it is still the one bound. */
export async function resumePick(
  parts: ResumeParts,
  stated: readonly string[],
  replyLanguage: string | null,
): Promise<PurchaseResult> {
  const ref = parts.park.held ?? "";
  parts.stage.reveal();
  const base = emptyResult(`urn:covenant:pick:${ref}:resumed`, ref);
  const holds = parts.findings.find(ref)?.title ?? null;
  if (parts.sandbox.theirs()) {
    return await stillTheirs(parts, base, { stated, replyLanguage, holds });
  }
  parts.progress.resumeReset();
  const from = parts.trail.length;
  // The record, read at the moment the wheel comes back: this leg has driven
  // nothing yet, the basket is whatever the parked leg actually put there, and
  // the handover that parked it is over - naming it here would be the one kind
  // of stale fact the block exists to keep out.
  const observed = observedBlock(
    factsFrom(parts.progress, {
      pages: [],
      cards: 0,
      basketHolds: parts.progress.carted ? holds : null,
      window: "agent",
    }),
  );
  const said = await parts.errand(
    resumeErrandFor(
      stated,
      parts.currency,
      parts.park.reason,
      replyLanguage,
      holds,
      observed,
    ),
    { stated, replyLanguage, from, holds },
  );
  return parts.close(base, ref, said);
}

/**
 * Their turn is still theirs. An errand now would be refused at every tool
 * and would throw the basket away over a sentence that was only slightly
 * early; instead the model is told whose the window is and says so, and the
 * park holds exactly as it was.
 */
async function stillTheirs(
  parts: ResumeParts,
  base: PurchaseResult,
  at: {
    readonly stated: readonly string[];
    readonly replyLanguage: string | null;
    readonly holds: string | null;
  },
): Promise<PurchaseResult> {
  // From the record, not from defaults. This turn drove nothing, so it has no
  // pages and no cards of its own; everything else - the form this host filled,
  // the sign-in it typed, the reason the wheel went over - is what the parked
  // leg actually observed, and saying otherwise would be a guess.
  const facts = factsFrom(parts.progress, {
    pages: [],
    cards: 0,
    basketHolds: parts.progress.carted ? at.holds : null,
    window: "shopper",
  });
  const told = await parts.say(
    pickSummaryFor(at.stated, at.replyLanguage, observedBlock(facts)),
  );
  const said = spokenBy(parts.hub, told);
  return settleAs(parts.hub, base, said, "web_pick_waiting");
}
