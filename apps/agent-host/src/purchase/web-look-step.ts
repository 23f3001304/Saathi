import type { TurnPlan } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { WebFindings } from "../browser/web-listing.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { ContextView } from "./context-record.js";
import { knownBlock } from "./context-digest.js";
import { errandFor } from "./web-errand.js";
import type {
  ErrandEnd,
  ObservedFacts,
  ProgressView,
} from "./observed-block.js";
import { factsFrom, observedBlock, windowOwnerOf } from "./observed-block.js";
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
 * started the run — which is what the no-stock path has and all it has.
 */
export interface WebLook {
  look(
    base: PurchaseResult,
    plan: TurnPlan,
    stated?: readonly string[],
    replyLanguage?: string | null,
  ): Promise<PurchaseResult>;
}

/** What a look may read about the window it does not drive: a checkout parked
 *  from an earlier turn is still a fact about their screen. */
export interface LookWatch {
  readonly progress: ProgressView;
  readonly window: { current(): { currentState(): string } | null };
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
    /** Released here: a look is about a category, never about one product,
     *  and the errand sessions share one tool runner. */
    private readonly pin: WebPin | null = null,
    /** The conversation's working context, read-only: a follow-up errand
     *  about a page already found starts at its URL rather than on a
     *  storefront's front door. `null` on a host that keeps no record. */
    private readonly context: ContextView | null = null,
    /** The host's record of the window, for the observed block. `null` on a
     *  harness with no window at all. */
    private readonly watch: LookWatch | null = null,
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
    this.pin?.release();
    this.stage.conceal();
    const from = this.trail.length;
    const seen = this.findings.length;
    const said = this.say(plan.reply.trim());
    const wrote = stated.length > 0 ? stated : [base.request];
    const errand = await this.attempt(query, wrote, replyLanguage, seen, from);
    this.offered?.offer(cardedListings(this.findings.since(seen)));
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
    const look = errandFor(query, asked, this.currency, replyLanguage, this.known());
    this.logger.debug("chat.reply_language", {
      at: "web_look",
      reply_language: replyLanguage,
      errand: look,
    });
    // Held for the length of the errand. Concealed, there is no frame stream
    // to count as a watcher, and the idle sweep would take the window away
    // between two page reads — which it did, on the first live run of this.
    const release = this.stage.hold();
    try {
      return await runErrand(
        this.errand,
        {
          look,
          // Exactly the rows that will be carded, so the prose and the grid
          // under it are about the same things.
          summarise: (ended: ErrandEnd) =>
            summariseFor(
              asked,
              replyLanguage,
              cardedListings(this.findings.since(seen)),
              observedBlock(this.facts(from, seen, ended)),
            ),
        },
        this.logger,
      );
    } finally {
      release();
    }
  }

  /** The record's slice for this errand: pages already found, as data. */
  private known(): string {
    return knownBlock(this.context?.current() ?? null);
  }

  /** The host's own record of this errand, for the model to speak from.
   *  Every read here is optional-chained: this runs on a window that may
   *  have just gone, and gathering facts must not be what ends the errand. */
  private facts(from: number, seen: number, ended: ErrandEnd): ObservedFacts {
    const state = this.watch?.window.current()?.currentState() ?? null;
    return factsFrom(this.watch?.progress ?? null, {
      pages: this.trail.since(from),
      cards: cardedListings(this.findings.since(seen)).length,
      window: windowOwnerOf(state),
      expired: ended.expired,
      failure: ended.failure,
    });
  }

  private say(reply: string): readonly string[] {
    if (reply.length === 0) {
      return [];
    }
    this.hub.emit({ kind: "message", text: reply });
    return [reply];
  }
}
