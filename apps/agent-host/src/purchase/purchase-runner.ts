
import { NothingStocked } from "../judge/catalog-match.js";
import { noStockTurn } from "../judge/no-stock-step.js";
import { buyThrough } from "./buy-step.js";
import { plannerDigest } from "./context-digest.js";
import { routeTypedPick } from "./typed-pick.js";
import { unfolded } from "./dialogue-compaction.js";
import { LANGUAGE_SLIPPED } from "./language-gate.js";
import { plannedTurn } from "./plan-gate.js";
import { anchorLine } from "./web-errand.js";
import type { Turn } from "./dialogue.js";
import { shopperLines, transcriptOf } from "./dialogue.js";
import type { PurchaseResult } from "./purchase-result.js";
import { emptyResult } from "./purchase-result.js";
import type { RunnerConfig, RunnerParts } from "./runner-parts.js";
import { nonPurchaseTurn } from "./turn-step.js";

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
    const runId = `urn:covenant:run:${this.parts.ids.uuid()}`;
    this.parts.hub.restart();
    this.parts.cartGate.reset();
    this.parts.log.reset();
    this.parts.offered.claim(chat ?? null);
    // After the table is claimed, because rehydrating puts cards back on it:
    // a restarted host reads this conversation's record and re-seats what an
    // earlier process had offered, so "go with the Crucial" still resolves.
    this.parts.context.claim(chat ?? null);
    this.parts.quotes.newRun();
    // Left open it went on presenting itself as current: a shopper asking in
    // Hindi about a gaming laptop was shown the footwear search from the
    // question before, with that run's actions still listed under it.
    await this.parts.sandbox.retire();
    const base = emptyResult(runId, request);
    try {
      // The turn's one shelf read: the probe, the listing, the drafter, the
      // catalog tool and the quote tool all read this snapshot, so no two of
      // them can disagree about the stock mid-purchase.
      await this.parts.shelf.open();
      return await this.drive(base, request, chat ?? null, replyLanguage);
    } catch (cause) {
      // A shop that stocks nothing like the request is an answer, not a
      // failure: nothing was drafted, so there is nothing to unwind.
      return cause instanceof NothingStocked
        ? this.filed(
            await noStockTurn(
              { ...this.parts, chat: chat ?? null },
              base,
              cause.request,
            ),
          )
        : this.abort(base, cause);
    }
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
    // reaching `buy`'s join would let it widen a covenant by talking. It is
    // also what the language gate reads the instruction off.
    const stated = shopperLines(dialogue);
    // Before the planner: a sentence naming a card already on their screen is
    // that card being chosen, not a fresh errand to go and run.
    const chose = await routeTypedPick(this.parts, base, request, {
      chat,
      replyLanguage,
      stated,
    });
    // Rolling compaction: lines already folded into the record's summary are
    // not replayed verbatim; the digest carries them, small, as data. What
    // may bound an intent is untouched — `stated` stays the whole half.
    const tail = unfolded(dialogue, this.parts.context.current()?.folded ?? null);
    const result =
      chose ??
      (await this.planned(base, [...traits, ...transcriptOf(tail)], {
        stated,
        replyLanguage,
        digest: plannerDigest(this.parts.context.current()),
      }));
    await this.said(result, chat);
    return this.filed(result, dialogue);
  }

  /** The model's move, and what the harness let follow from it. */
  private async planned(
    base: PurchaseResult,
    lines: readonly string[],
    turn: {
      stated: readonly string[];
      replyLanguage: string | null;
      digest: string;
    },
  ): Promise<PurchaseResult> {
    const { plan, slipped } = await plannedTurn(
      this.parts.planner,
      lines,
      turn.replyLanguage,
      anchorLine(turn.stated),
      this.parts.logger,
      turn.digest,
    );
    const answered = await nonPurchaseTurn(
      this.parts,
      base,
      plan,
      turn.stated,
      turn.replyLanguage,
    );
    const result =
      answered ?? (await buyThrough(this.parts, this.config, base, turn.stated));
    if (slipped) this.noteSlip();
    return result;
  }

  /** Said in the harness's own voice: the turn stands, the language was not
   *  the one they asked for, and pretending otherwise would be the lie. */
  private noteSlip(): void {
    this.parts.hub.emit({
      kind: "message",
      text: LANGUAGE_SLIPPED,
      variant: "system",
    });
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
