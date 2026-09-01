/**
 * A wall-clock ceiling on a whole errand.
 *
 * DECISION: the turn-level analogue of `settledRead`'s ceiling, and it exists
 * because that one was not enough. A read is bounded; a search, a click, a
 * cart scrape and a form fill are bounded now too — but the class of failure
 * they belong to is "something inside the errand never came back", and the
 * next member of it will be somewhere nobody has thought to look. A live run
 * proved that: a container's renderer died, the service relaunched, and the
 * errand stopped producing steps, model calls or events at all, with
 * `ChatService`'s queue behind it. The shopper's word was "got stuck".
 *
 * So this is not a fix for a known hang. It is the statement that an errand
 * ends: whatever went wrong and wherever, the turn closes honestly with
 * whatever was captured, and the conversation carries on.
 *
 * DECISION: it cannot cancel what it abandons — there is no way to cancel a
 * CDP command or a model round trip in flight. What it guarantees is that
 * nothing downstream is still *waiting* on one. The abandoned work settles
 * into a conversation that has already been closed, which is why the errand's
 * session is reset when this fires: a turn nobody awaited must not be resumed
 * as though it had been.
 */
export const ERRAND_CEILING_MS = 210_000;

export class ErrandExpired extends Error {
  constructor(readonly afterMs: number) {
    super(`the errand did not finish within ${afterMs}ms`);
    this.name = "ErrandExpired";
  }
}

export interface Deadline {
  /** Races `work` against the remaining time. */
  guard<T>(work: Promise<T>): Promise<T>;
  /** True once the ceiling has passed, so a caller can tell an expiry from an
   *  ordinary failure without catching for the type. */
  readonly passed: boolean;
  /** Always call it: an armed timer holds nothing open, but a rejection nobody
   *  raced would be reported as unhandled. */
  cancel(): void;
}

export function errandDeadline(ms: number = ERRAND_CEILING_MS): Deadline {
  let expired = false;
  let stop: (() => void) | null = null;
  const ceiling = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      expired = true;
      reject(new ErrandExpired(ms));
    }, ms);
    timer.unref?.();
    stop = () => {
      clearTimeout(timer);
    };
  });
  // Nothing may go unhandled on the leg where the errand finished first.
  ceiling.catch(() => undefined);
  return {
    guard: <T,>(work: Promise<T>) => Promise.race([work, ceiling]),
    get passed(): boolean {
      return expired;
    },
    cancel: () => stop?.(),
  };
}
