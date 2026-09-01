import type { Logger } from "@covenant/domain";

import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { WebResult } from "../browser/web-result.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "./purchase-result.js";
import { emptyResult } from "./purchase-result.js";
import {
  buyErrandFor,
  pickSummaryFor,
  resumeErrandFor,
} from "./web-buy-errand.js";
import { runErrand } from "./errand-run.js";
import { FORGOTTEN, NOT_OPENED, STILL_THEIRS } from "./web-buy-copy.js";
import type { Spoken } from "./web-pick-close.js";
import { closePick, emitLine, settleAs, spokenBy } from "./web-pick-close.js";
import type { WebPickPark } from "./web-pick-park.js";
import type { WebErrand } from "./errand-run.js";
import type { WebPin } from "./web-pin.js";
import type { WindowStage } from "./window-stage.js";
import { OPEN_STAGE } from "./window-stage.js";

/** The one sandbox move this step makes itself, and the question it asks
 *  first: whose turn is it at the window? */
export interface SandboxOpener {
  open(url: string): Promise<WebResult>;
  /** True while the shopper holds the wheel. */
  theirs(): boolean;
}

/**
 * What happens when the shopper taps one of the open-web cards, or names one.
 *
 * DECISION: the pick arrives as a ref, resolved here against the listings this
 * host read. No URL comes in from the client, so a tapped card cannot navigate
 * anywhere the run has not been — and a choice that resolves to nothing is
 * refused, never approximated.
 *
 * DECISION: this signs nothing and drafts nothing, like the look it follows.
 * Nothing is signed off this platform: the run ends holding a shop's own
 * basket with the payment step still theirs.
 */
export class WebBuyStep {
  constructor(
    private readonly hub: BeatHub,
    private readonly conversation: WebErrand,
    private readonly sandbox: SandboxOpener,
    private readonly trail: WebTrail,
    private readonly findings: WebFindings,
    private readonly logger: Logger,
    private readonly currency: string,
    /** What this host watched itself do at the window. */
    private readonly progress: WebProgress,
    private readonly park: WebPickPark,
    /** A tapped card is a checkout: exactly where a person has to be able to
     *  see the page and take the wheel. */
    private readonly stage: WindowStage = OPEN_STAGE,
    /** Held for the length of this errand, so no other product can be opened
     *  from inside it. */
    private readonly pin: WebPin | null = null,
  ) {}

  get parked(): boolean {
    return this.park.parked;
  }

  /** Picks up where it stopped, in the same window, on the same step: no
   *  listing is re-opened, which is why `sandboxOf` refuses to retire it. */
  async resume(
    stated: readonly string[],
    replyLanguage: string | null = null,
  ): Promise<PurchaseResult> {
    const ref = this.park.held ?? "";
    this.stage.reveal();
    const base = emptyResult(`urn:covenant:pick:${ref}:resumed`, ref);
    // Their turn is still theirs. Running the errand here would spend a model
    // turn being refused by the state machine and release the park, throwing
    // away the basket over a sentence that was only slightly early.
    if (this.sandbox.theirs()) {
      return settleAs(
        this.hub,
        base,
        [emitLine(this.hub, STILL_THEIRS, true)],
        "web_pick_waiting",
      );
    }
    this.progress.reset();
    const from = this.trail.length;
    // What the basket holds, from this host's own record of the pick — the
    // listing the parked ref resolves to, never the errand's memory of it.
    const holds = this.findings.find(ref)?.title ?? null;
    const said = await this.errand(
      resumeErrandFor(
        stated,
        this.currency,
        this.park.reason,
        replyLanguage,
        holds,
      ),
      stated,
      replyLanguage,
    );
    return this.close(base, ref, from, said);
  }

  async buy(
    ref: string,
    stated: readonly string[],
    replyLanguage: string | null = null,
  ): Promise<PurchaseResult> {
    this.stage.reveal();
    const base = emptyResult(`urn:covenant:pick:${ref}`, ref);
    const listing = this.findings.find(ref);
    if (listing === null) {
      // Refused, not approximated: picking a nearest match would be the host
      // inventing the shop it is about to drive. It still answers.
      this.logger.warn("purchase.web_pick.unresolved", { ref });
      return settleAs(
        this.hub,
        base,
        [emitLine(this.hub, FORGOTTEN, true)],
        "web_pick_unknown",
      );
    }
    const from = this.trail.length;
    const landed = await this.sandbox.open(listing.url);
    if (landed.isError) {
      return settleAs(
        this.hub,
        base,
        [emitLine(this.hub, NOT_OPENED, true)],
        "web_pick_shut",
      );
    }
    this.progress.reset();
    const said = await this.errand(
      buyErrandFor(listing, stated, this.currency, replyLanguage),
      stated,
      replyLanguage,
    );
    this.logger.info("purchase.web_pick", { ref, url: listing.url });
    return this.close(base, ref, from, said, listing.url);
  }

  /** How it ends is decided from what this host watched, never from what the
   *  errand said — see `web-pick-close.ts`. */
  private close(
    base: PurchaseResult,
    ref: string,
    from: number,
    spoke: Spoken,
    fallback = "",
  ): PurchaseResult {
    return closePick(
      {
        hub: this.hub,
        park: this.park,
        progress: this.progress,
        trail: this.trail,
        logger: this.logger,
      },
      { base, ref, from, spoke, fallback },
    );
  }

  /**
   * Drive the checkout, then say what happened — two legs on one conversation,
   * the same shape the look uses, so the sentence a shopper reads is composed
   * once at the end rather than stitched out of what was said between clicks.
   * The language gate and the wall clock both sit on that one commit, and a
   * thrown page is still a turn that answers.
   */
  private async errand(
    prompt: string,
    stated: readonly string[],
    replyLanguage: string | null,
  ): Promise<Spoken> {
    const release = this.stage.hold();
    try {
      const run = await runErrand(
        this.conversation,
        {
          look: prompt,
          summarise: () => pickSummaryFor(stated, replyLanguage),
          stated,
          replyLanguage,
        },
        this.logger,
      );
      return { told: spokenBy(run), slipped: run.slipped };
    } finally {
      release();
    }
  }
}
