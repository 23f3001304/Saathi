// What a tapped card does: which of the two legs its ref takes, the queueing
// that keeps one window on one timeline, and the beat that says which card it
// was. Split out of `chat-service.ts` the way `chat-cancel.ts` was, because
// that file sits on its `max-lines` cap — and this is the seam worth cutting
// anyway: the rule about when a pick becomes a fact belongs beside the legs,
// not inside the engine that queues a conversation's turns.
import type { PurchaseResult } from "../purchase/purchase-result.js";
import { emptyResult } from "../purchase/purchase-result.js";
import type { BeatHub } from "./beat-hub.js";
import type { RunnerPort, WebPickRunner } from "./chat-state.js";

/** What a tapped card needs of `ChatService`, and nothing else. */
export interface PickEngine {
  readonly hub: BeatHub;
  readonly runner: RunnerPort;
  readonly webPick: WebPickRunner;
  /** What this run was asked for, so a tapped ref carries the errand's brief. */
  readonly stated: string;
  /** The reply language as last stated; a tapped ref carries none. */
  readonly language: string | null;
  readonly queue: (
    pending: PurchaseResult,
    work: (busy: Promise<PurchaseResult> | null) => Promise<PurchaseResult>,
  ) => PurchaseResult;
  /** However the leg ended: the window as it stands, written down. */
  readonly settled: () => void;
}

/** Wheel back = carry on: the parked checkout resumes by itself. */
export function carryOnPick(engine: PickEngine): PurchaseResult | null {
  if (!engine.webPick.parked) return null;
  return engine.queue(
    emptyResult("urn:covenant:pick:carry-on", "carry on"),
    async (busy) => {
      if (busy !== null) await busy.catch(() => undefined);
      return engine.webPick.resume([], engine.language);
    },
  );
}

/** A tapped card queues like a sentence: one window, one timeline. */
export function pickCard(engine: PickEngine, ref: string): PurchaseResult {
  return engine.queue(emptyResult(`urn:covenant:pick:${ref}`, ref), (busy) =>
    legFor(engine, busy, ref),
  );
}

/**
 * DECISION: the `picked` beat is written where the ref resolves, never on the
 * way in. Why: a tap carries a ref off a card that may be a run old, so
 * announcing the choice before either leg had claimed it wrote a beat for a
 * card nobody bought. Here that is the rebuilt cart; on the open-web leg it is
 * the listing `WebBuyStep` resolves, which is where that leg says it.
 *
 * Waits for the predecessor first, so a queued tap's beats never interleave.
 */
async function legFor(
  engine: PickEngine,
  inFlight: Promise<PurchaseResult> | null,
  ref: string,
): Promise<PurchaseResult> {
  if (inFlight !== null) await inFlight.catch(() => undefined);
  try {
    const reproposed = await engine.runner.repropose(ref);
    if (reproposed === null) {
      return await engine.webPick.buy(ref, [engine.stated], engine.language);
    }
    engine.hub.emit({ kind: "picked", ref });
    return reproposed;
  } finally {
    engine.settled();
  }
}
