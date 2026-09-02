
import { reproposeSku } from "./buy-step.js";
import { planned } from "./planned-turn.js";
import { plannerDigest } from "./context-digest.js";
import { unfolded } from "./dialogue-compaction.js";
import type { Turn } from "./dialogue.js";
import { shopperLines, transcriptOf } from "./dialogue.js";
import type { PurchaseResult } from "./purchase-result.js";
import { emptyResult } from "./purchase-result.js";
import type { RunnerConfig, RunnerParts } from "./runner-parts.js";

export type { RunnerConfig, RunnerParts } from "./runner-parts.js";

/**
 * One purchase, end to end: sign the covenant, hold the conversation, write
 * what the merchant said into PTLM, assemble a cart the signed intent permits,
 * and hand it to the gateway. Every money-shaped step is driven from here: the
 * model advises, the harness decides what is legal.
 */
export class PurchaseRunner {
  constructor(
    private readonly parts: RunnerParts,
    private readonly config: RunnerConfig,
  ) {}

  async run(
    request: string,
    chat?: string,
    replyLanguage: string | null = null,
  ): Promise<PurchaseResult> {
    const base = emptyResult(await this.freshTable(chat ?? null), request);
    try {
      // The turn's one shelf read: the probe, the listing, the drafter, the
      // catalog tool and the quote tool all read this snapshot, so no two of
      // them can disagree about the stock mid-purchase.
      await this.parts.shelf.open();
      return await this.drive(base, request, chat ?? null, replyLanguage);
    } catch (cause) {
      // A drafter that can find nothing to name is a fault of the drafter,
      // not a turn for the harness to answer on the model's behalf. The
      // shelf reaches the model as a tool from Stage 2 on, and the draft
      // becomes the model's own proposal in Stage 3; until then a refusal
      // here ends the run and drives nothing.
      return this.abort(base, cause);
    }
  }

  /** Everything a turn must not inherit from the one before it: gates, the
   *  offered table (claimed before context, because rehydrating re-seats an
   *  earlier process's cards so "go with the Crucial" still resolves), and
   *  the sandbox window, which left open went on presenting a previous run's
   *  search as current. Returns the fresh run's id. */
  private async freshTable(chat: string | null): Promise<string> {
    const runId = `urn:covenant:run:${this.parts.ids.uuid()}`;
    this.parts.hub.restart();
    this.parts.cartGate.reset();
    this.parts.log.reset();
    this.parts.lastProposal.clear();
    this.parts.pending.clear();
    this.parts.offered.claim(chat);
    this.parts.context.claim(chat);
    this.parts.quotes.newRun();
    // The window survives the turn on purpose now. Retiring it here dated
    // from research driving the sandbox, when a stale search could present
    // itself as current; research rides live web search today, a buy leg
    // navigates the window to its own listing, and the profile behind it
    // holds the shopper's sign-in. Deleting all that on every sentence was
    // "why is the sandbox getting deleted".
    return runId;
  }

  private abort(base: PurchaseResult, cause: unknown): PurchaseResult {
    const failure = cause instanceof Error ? cause.message : "unknown failure";
    this.parts.logger.error("purchase.failed", { run_id: base.runId, failure });
    this.parts.hub.emit({
      kind: "outcome",
      state: "failed",
      txnId: null,
      detail: failure,
    });
    return { ...base, status: "failed", failure };
  }

  /** The first move is the model's, and only one of the six leads to money.
   *  Before this existed "hi" drafted an intent and offered four kurtas. What
   *  may follow is decided in `nonPurchaseTurn`; only its `null` buys. */
  private async drive(
    base: PurchaseResult,
    request: string,
    chat: string | null,
    replyLanguage: string | null,
  ): Promise<PurchaseResult> {
    this.parts.language.set(replyLanguage);
    this.parts.logger.debug("chat.reply_language", {
      at: "runner",
      run_id: base.runId,
      reply_language: replyLanguage,
    });
    await this.parts.conversation.remember(request, chat);
    // Two memories, different in scope: mixing them fused every old sentence.
    const dialogue = await this.parts.conversation.recall(request, chat);
    const traits = await this.parts.traits.recall(request);
    // Only the shopper's half may bound anything: the agent's own prose
    // reaching `buy`'s join would let it widen a covenant by talking.
    const stated = shopperLines(dialogue);
    // Rolling compaction: lines already folded into the record's summary are
    // not replayed verbatim; the digest carries them, small, as data. What
    // may bound an intent is untouched — `stated` stays the whole half.
    const tail = unfolded(dialogue, this.parts.context.current()?.folded ?? null);
    const result = await planned(
      this.parts,
      this.config,
      base,
      [...traits, ...transcriptOf(tail)],
      {
        stated,
        replyLanguage,
        digest: plannerDigest(this.parts.context.current()),
      },
    );
    await this.said(result, chat);
    return this.filed(result, dialogue);
  }

  /** The cart, rebuilt for a tapped platform card; `null` when the tap is
   *  not this runner's to serve (no standing proposal, or a web ref). */
  repropose(ref: string): Promise<PurchaseResult | null> {
    const base = emptyResult(
      `urn:covenant:pick:${this.parts.ids.uuid()}`,
      ref,
    );
    return reproposeSku(this.parts, this.config, base, ref);
  }

  /** The working context, written by the shell after the turn from what it
   *  observed — the table, the park, the progress — never from the plan. */
  private filed(
    result: PurchaseResult,
    dialogue: readonly Turn[] = [],
  ): PurchaseResult {
    this.parts.context.noted(result, dialogue);
    return result;
  }

  /** The agent's turn, written back where the shopper's already lives: without
   *  it `recall` returned a monologue and "yes" had no antecedent. */
  private async said(
    result: PurchaseResult,
    chat: string | null,
  ): Promise<void> {
    const spoken = result.transcript.join(" ").trim();
    if (spoken.length > 0) {
      await this.parts.conversation.rememberAgent(spoken, chat);
    }
  }

}
