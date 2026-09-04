import type { TurnPlan } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { WebFindings } from "../browser/web-listing.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { ContextView } from "./context-record.js";
import type { PageIndex } from "./page-index.js";
import { indexable } from "./seen-block.js";
import { lookBrief } from "./look-brief.js";
import { lookFacts } from "./look-facts.js";
import type { FactParts, LookWatch } from "./look-facts.js";

export type { LookWatch } from "./look-facts.js";
import type { BriefParts } from "./look-brief.js";
import type { ErrandEnd } from "./observed-block.js";
import { observedBlock } from "./observed-block.js";
import type { PurchaseResult } from "./purchase-result.js";
import { reportFindings, settleLook } from "./web-look-report.js";
import type { WebOffered } from "./web-offered.js";
import type { WebPin } from "./web-pin.js";
import { cardedListings } from "./web-options.js";
import type { WindowStage } from "./window-stage.js";
import { OPEN_STAGE } from "./window-stage.js";
import type { ErrandRun, WebErrand } from "./errand-run.js";
import { runErrand } from "./errand-run.js";
import { summariseFor } from "./web-summary.js";

export type { WebErrand } from "./errand-run.js";

/**
 * What a turn does when the model decided the answer is on the open web.
 *
 * `stated` is the shopper's own half of this conversation, and the errand
 * reads its language off it. Absent, the turn falls back to the sentence that
 * started the run, which is all a caller holding no transcript can give it.
 */
export interface WebLook {
  look(
    base: PurchaseResult,
    plan: TurnPlan,
    stated?: readonly string[],
    replyLanguage?: string | null,
  ): Promise<PurchaseResult>;
}

/**
 * Looking on the open web, as a terminal outcome of a turn.
 *
 * DECISION: this reaches the sandbox without drafting an intent. Buying needs
 * a signed mandate; looking needs nothing, and the open-web tools used to sit
 * behind `draft_intent` → the buyer's tool loop, so a browse could say "I'll
 * look on Amazon" and then read out the local fixture catalog. Signing a
 * covenant to *look* is a price nobody should pay.
 *
 * DECISION: the promise and the errand are the same call. `plan.reply` is
 * emitted from inside this method and nowhere else, so "I'll look on Amazon"
 * cannot be said by a turn that does not then go — and what is said afterwards
 * is written from `WebTrail`, where the window actually landed.
 */
export class WebLookStep implements WebLook {
  constructor(
    private readonly hub: BeatHub,
    private readonly errand: WebErrand,
    private readonly trail: WebTrail,
    /** Every product tile the window was shown, shared with `WebShopper`. */
    private readonly findings: WebFindings,
    private readonly logger: Logger,
    /** The covenant's denomination — the market the errand shops in. */
    private readonly currency: string,
    /** Research is not a performance: the window it reads through stays off
     *  the shopper's screen, and the step pills are what they watch instead.
     *  Defaulted so a test can drive a look with no stage to manage. */
    private readonly stage: WindowStage = OPEN_STAGE,
    /** Where the cards this turn put on the table are recorded, so a later
     *  sentence naming one of them is understood as the pick it is. */
    private readonly offered: WebOffered | null = null,
    /** Aimed here: a look is about a category, never about one product, and
     *  about the shop they named when they named one. */
    private readonly pin: WebPin | null = null,
    /** The conversation's working context, read-only: a follow-up errand
     *  about a page already found starts at its URL rather than on a
     *  storefront's front door. `null` on a host that keeps no record. */
    private readonly context: ContextView | null = null,
    /** The host's record of the window, for the observed block. `null` on a
     *  harness with no window at all. */
    private readonly watch: LookWatch | null = null,
    /** Pages any earlier errand on this host opened. Optional: a host without
     *  one searches from scratch, which is what every host did before. */
    private readonly pages: PageIndex | null = null,
  ) {}

  async look(
    base: PurchaseResult,
    plan: TurnPlan,
    stated: readonly string[] = [],
    replyLanguage: string | null = null,
  ): Promise<PurchaseResult> {
    // The plan's own query when it named one, else what they asked for. The
    // model wrote it; nothing here rewrites it.
    const query = (plan.query ?? base.request).trim();
    this.pin?.toShop(plan.shop ?? null, this.currency);
    this.stage.conceal();
    const from = this.trail.length;
    const seen = this.findings.length;
    const said = this.say(plan.reply.trim());
    const wrote = stated.length > 0 ? stated : [base.request];
    const errand = await this.attempt(query, wrote, replyLanguage, seen, from);
    this.offered?.offer(cardedListings(this.findings.since(seen)));
    // Filed after the errand and only from what was carded: a row that never
    // reached the shopper's screen is not a page worth sending anyone back to.
    this.file(query, seen);
    const found = reportFindings(this.hub, {
      errand,
      found: this.findings.since(seen),
    });
    this.logger.info("purchase.web_look", {
      run_id: base.runId,
      query,
      pages: this.trail.since(from).length,
      blocked: errand.result.blocked.length,
      failed: errand.failure,
    });
    return settleLook(this.hub, base, [...said, ...found], errand.result);
  }

  /**
   * A look that went wrong is still a turn that has to answer. A puppeteer
   * error out of the sandbox — a context destroyed by a navigation, say — used
   * to propagate to `PurchaseRunner.abort` and fail the whole run, so the
   * shopper's question got a stack-trace-shaped outcome and no sentence.
   */
  private async attempt(
    query: string,
    asked: readonly string[],
    replyLanguage: string | null,
    /** Where `WebFindings` stood: rows past this ground the summary. */
    seen: number,
    /** Where `WebTrail` stood: the pages this errand reached, and no others. */
    from: number,
  ): Promise<ErrandRun> {
    const look = lookBrief(this.briefParts(), query, asked, replyLanguage);
    // Exactly the rows that will be carded, so the prose and the grid under it
    // are about the same things.
    const summarise = (ended: ErrandEnd): string =>
      summariseFor(
        asked,
        replyLanguage,
        cardedListings(this.findings.since(seen)),
        observedBlock(lookFacts(this.factParts(), from, seen, ended)),
      );
    // Held for the length of the errand. Concealed, there is no frame stream
    // to count as a watcher, and the idle sweep would take the window away
    // between two page reads — which it did, on the first live run of this.
    const release = this.stage.hold();
    try {
      return await runErrand(this.errand, { look, summarise }, this.logger);
    } finally {
      release();
    }
  }

  private factParts(): FactParts {
    return { trail: this.trail, findings: this.findings, watch: this.watch };
  }

  private briefParts(): BriefParts {
    return {
      currency: this.currency,
      logger: this.logger,
      context: this.context,
      pages: this.pages,
    };
  }

  /** Files the pages this errand actually carded, so the next ask for
   *  something like it starts from URLs already proved to be real. A row that
   *  never reached the shopper's screen is not one to send anyone back to. */
  private file(query: string, seen: number): void {
    this.pages?.remember(
      query,
      indexable(cardedListings(this.findings.since(seen))),
    );
  }


  private say(reply: string): readonly string[] {
    if (reply.length === 0) {
      return [];
    }
    this.hub.emit({ kind: "message", text: reply });
    return [reply];
  }
}
