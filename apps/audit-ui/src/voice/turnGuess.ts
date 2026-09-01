// The endpointing call costs 400–600 ms, and paying it *after* the recogniser
// has already waited out the silence makes it serial: the shopper stops
// talking, waits for the microphone to give up, then waits again for a model
// to agree they have stopped.
//
// So it is asked early. Partial transcripts arrive while the shopper is still
// trailing off, and the verdict for the words so far is computed then and kept.
// By the time the utterance goes final the answer is usually already in hand,
// and the added wait is nothing. Being wrong is cheap in both directions: a
// stale guess is simply not used, and a missing one falls back to asking.
import type { TurnEndDetector } from "./turnEnd.ts";

/** Long enough that a steady talker does not fire one per syllable, short
 *  enough that the guess is ready when the silence times out. */
const SETTLE_MS = 240;

/** Below this there is nothing to judge and the answer is always "keep going". */
const MIN_WORDS = 2;

function key(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): number {
  return key(text).split(" ").filter(Boolean).length;
}

export interface TurnGuess {
  /** Feed a partial transcript; the verdict for it is computed in the gap. */
  readonly observe: (interim: string) => void;
  /** The verdict already computed for this text, if there is one. */
  readonly verdict: (text: string) => boolean | undefined;
  readonly reset: () => void;
}

export function createTurnGuess(detector: TurnEndDetector): TurnGuess {
  const known = new Map<string, boolean>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function ask(text: string): void {
    const at = key(text);
    if (at === "" || known.has(at)) return;
    void detector.complete(text).then((done) => known.set(at, done));
  }

  return {
    observe: (interim: string): void => {
      if (timer !== null) clearTimeout(timer);
      if (words(interim) < MIN_WORDS) return;
      timer = setTimeout(() => ask(interim), SETTLE_MS);
    },
    verdict: (text: string): boolean | undefined => known.get(key(text)),
    reset: (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      known.clear();
    },
  };
}
