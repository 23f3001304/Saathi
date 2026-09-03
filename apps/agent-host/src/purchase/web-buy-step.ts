import type { Logger } from "@covenant/domain";

import type { KnownAddress } from "../browser/web-address-fill.js";
import type { IntentFlow } from "./intent-flow.js";
import { covenantFirst, profileOf } from "./web-buy-covenant.js";
import type { ResumeParts } from "./web-buy-resume.js";
import { resumePick } from "./web-buy-resume.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { WebResult } from "../browser/web-result.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "./purchase-result.js";
import { emptyResult } from "./purchase-result.js";
import { buyErrandFor, pickSummaryFor } from "./web-buy-errand.js";
import { runErrand } from "./errand-run.js";
import type { ErrandEnd } from "./observed-block.js";
import { observedBlock } from "./observed-block.js";
import { pickAfterword, pickFacts, saidAlone, spokenBy } from "./pick-facts.js";
import type { Spoken } from "./web-pick-close.js";
import { closePick, settleAs } from "./web-pick-close.js";
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
    /** What the shopper has stated about where they live, for the errand to
     *  compare against a shop's pre-selected account address. Values are
     *  typed only ever by `web_fill_address`; this is the comparison copy. */
    private readonly address: KnownAddress | null = null,
    /** Sign-before-drive: the tapped listing becomes a drafted intent, the
     *  run parks at the hold-to-sign, and only a signature opens the shop.
     *  `null` keeps the old unsigned behaviour for tests that predate it. */
    private readonly intents: IntentFlow | null = null,
  ) {}

  get parked(): boolean {
    return this.park.parked;
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
      // inventing the shop it is about to drive. Nothing is said in anybody's
      // voice; the outcome beat closes the turn.
      this.logger.warn("purchase.web_pick.unresolved", { ref });
      return settleAs(this.hub, base, [], "web_pick_unknown");
    }
    await covenantFirst(this.intents, listing);
    const from = this.trail.length;
    const landed = await this.sandbox.open(listing.url);
    if (landed.isError) {
      // The one fact is that the page did not open; the model says so.
      const told = await pickAfterword(
        this.conversation,
        { stated, replyLanguage },
        { failure: "the listing page could not be opened" },
      );
      return settleAs(this.hub, base, spokenBy(this.hub, told), "web_pick_shut");
    }
    this.progress.reset();
    const home = await profileOf(this.address);
    const said = await this.errand(
      buyErrandFor(listing, stated, this.currency, replyLanguage, home),
      { stated, replyLanguage, from, holds: listing.title },
    );
    this.logger.info("purchase.web_pick", { ref, url: listing.url });
    return this.close(base, ref, said);
  }

  /** Picks up where it stopped: no re-open, no re-sign, the same window on
   *  the same step. The body lives in web-buy-resume.ts. */
  resume(
    stated: readonly string[],
    replyLanguage: string | null = null,
  ): Promise<PurchaseResult> {
    const parts: ResumeParts = {
      park: this.park,
      stage: this.stage,
      sandbox: this.sandbox,
      progress: this.progress,
      trail: this.trail,
      findings: this.findings,
      currency: this.currency,
      hub: this.hub,
      errand: (prompt, at) => this.errand(prompt, at),
      say: (prompt) => saidAlone(this.conversation, prompt),
      close: (base, ref, said) => this.close(base, ref, said),
    };
    return resumePick(parts, stated, replyLanguage);
  }

  private close(base: PurchaseResult, ref: string, spoke: Spoken): PurchaseResult {
    return closePick(
      { hub: this.hub, park: this.park, progress: this.progress, logger: this.logger },
      { base, ref, spoke },
    );
  }

  /** The errand's two legs, the second told what this host watched. */
  private async errand(
    prompt: string,
    at: {
      readonly stated: readonly string[];
      readonly replyLanguage: string | null;
      readonly from: number;
      readonly holds: string | null;
    },
  ): Promise<Spoken> {
    const release = this.stage.hold();
    try {
      const watch = {
        trail: this.trail,
        progress: this.progress,
        theirs: () => this.sandbox.theirs(),
      };
      const prompts = {
        look: prompt,
        summarise: (ended: ErrandEnd) =>
          pickSummaryFor(
            at.stated,
            at.replyLanguage,
            observedBlock(pickFacts(watch, at, ended)),
          ),
      };
      const run = await runErrand(this.conversation, prompts, this.logger);
      return { told: run.told, expired: run.expired };
    } finally {
      release();
    }
  }
}

