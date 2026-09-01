import type { PageListing } from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import type { WebListingView } from "../browser/web-listing.js";
import type { ContextLog } from "./context-log.js";
import { foldInto } from "./dialogue-compaction.js";
import type { Turn } from "./dialogue.js";
import { shopperLines } from "./dialogue.js";
import type { PurchaseResult } from "./purchase-result.js";
import { distilQuery } from "./query-distil.js";
import type { ParkReason } from "./web-pick-park.js";
import type { ContextPick, WorkingContext } from "./working-context.js";
import { optionOf, parseContext, seedOf } from "./working-context.js";

/** A pick run's id names the ref it drove; `WebBuyStep` mints them so. */
const PICK_RUN = "urn:covenant:pick:";

const ASKED_CLAMP = 200;

const SAID_CLAMP = 280;

/** What the recorder reads. Structural, like `SandboxOwner`: this file must
 *  not learn how a card table or a park is built, only what each one holds. */
export interface ContextSources {
  readonly offered: {
    live(conversation: string | null): readonly WebListingView[];
    offer(rows: readonly WebListingView[]): void;
  };
  readonly park: { readonly held: string | null; readonly reason: ParkReason };
  readonly progress: {
    readonly carted: boolean;
    readonly filled: readonly string[];
    readonly handedOver: string | null;
  };
  readonly findings: {
    record(found: readonly PageListing[]): readonly WebListingView[];
    find(ref: string): WebListingView | null;
  };
}

/** The slice of the recorder a reader needs — the errand steps and the
 *  planner take this, so neither can write the record. */
export interface ContextView {
  current(): WorkingContext | null;
}

/** What the runner holds: claim at the top of a run, note at the bottom. */
export interface ContextRecall extends ContextView {
  claim(conversation: string | null): void;
  noted(result: PurchaseResult, dialogue: readonly Turn[]): void;
}

/** For hosts and harnesses that keep no record: every read is empty and every
 *  write is dropped, which is exactly what a `null` conversation gets too. */
export function inertContext(): ContextRecall {
  return {
    claim: () => undefined,
    current: () => null,
    noted: () => undefined,
  };
}

/**
 * The conversation's working context: loaded when a run claims its chat,
 * written back by the shell when the run ends.
 *
 * DECISION: rehydration happens at claim, into the same in-memory tables a
 * live errand fills — the stored options are re-minted through `WebFindings`
 * and put back on `WebOffered`'s table. That is what makes a restart honest
 * end to end: a typed "go with the Crucial" resolves to a ref this process
 * holds, `noStockTurn` re-presents cards that really are re-presentable, and a
 * pick opens a URL this host recorded itself landing on.
 */
export class ContextRecorder implements ContextRecall {
  private chat: string | null = null;
  private held: WorkingContext | null = null;

  constructor(
    private readonly log: ContextLog,
    private readonly sources: ContextSources,
    private readonly logger: Logger,
  ) {}

  claim(conversation: string | null): void {
    this.chat = conversation;
    this.held =
      conversation === null ? null : parseContext(this.log.load(conversation));
    this.reseed();
  }

  current(): WorkingContext | null {
    return this.held;
  }

  noted(result: PurchaseResult, dialogue: readonly Turn[]): void {
    if (this.chat === null) return;
    const record = this.recordOf(this.chat, result, dialogue);
    this.held = record;
    try {
      this.log.save(this.chat, JSON.stringify(record));
    } catch (cause) {
      // A conversation whose record cannot be written down still happened.
      this.logger.warn("chat.context.write_failed", {
        cause: cause instanceof Error ? cause.message : "unknown",
      });
    }
  }

  private recordOf(
    chat: string,
    result: PurchaseResult,
    dialogue: readonly Turn[],
  ): WorkingContext {
    const was = this.held;
    const compacted = foldInto(
      { summary: was?.summary ?? null, folded: was?.folded ?? null },
      dialogue,
    );
    return {
      v: 1,
      asked: this.askedOf(dialogue) ?? was?.asked ?? null,
      options: this.sources.offered.live(chat).map(optionOf),
      pick: this.pickOf(result),
      progress: this.progressOf(),
      outcome: outcomeOf(result),
      ...compacted,
    };
  }

  /** Their own lines with the turn-taking taken out — the same distillation
   *  the errand query uses, so the record and the search agree on the want. */
  private askedOf(dialogue: readonly Turn[]): string | null {
    const stated = shopperLines(dialogue).join("\n").trim();
    if (stated === "") return null;
    return distilQuery(stated).slice(0, ASKED_CLAMP);
  }

  /** The card a pick errand was about: the parked one, or the one this run's
   *  own id names. Resolved against the host's record; nothing else counts. */
  private pickOf(result: PurchaseResult): ContextPick | null {
    const ref =
      this.sources.park.held ??
      (result.runId.startsWith(PICK_RUN) ? result.request : null);
    if (ref === null) return null;
    const listing = this.sources.findings.find(ref);
    if (listing === null) return null;
    return { ref, title: optionOf(listing).title, url: listing.url };
  }

  private progressOf(): WorkingContext["progress"] {
    const { park, progress } = this.sources;
    const stopped =
      park.held !== null
        ? park.reason
        : progress.handedOver === "payment"
          ? "payment"
          : null;
    if (stopped === null && !progress.carted && progress.filled.length === 0) {
      return null;
    }
    return { carted: progress.carted, filled: progress.filled, stopped };
  }

  private reseed(): void {
    const known = this.held?.options ?? [];
    if (known.length === 0) return;
    if (this.sources.offered.live(this.chat).length > 0) return;
    const seeded = this.sources.findings.record(known.map(seedOf));
    this.sources.offered.offer(seeded);
    // The stored refs died with the process that minted them; the record now
    // carries the ones this process can actually resolve.
    this.held =
      this.held === null
        ? null
        : { ...this.held, options: seeded.map(optionOf) };
    this.logger.info("chat.context.rehydrated", { options: seeded.length });
  }
}

function outcomeOf(result: PurchaseResult): WorkingContext["outcome"] {
  const last = result.transcript[result.transcript.length - 1]?.trim() ?? "";
  return {
    state: result.status,
    said: last === "" ? null : last.slice(0, SAID_CLAMP),
  };
}
