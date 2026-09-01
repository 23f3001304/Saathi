/**
 * How long one sandbox tool call may take before the errand gives up on it.
 *
 * DECISION: at the tool boundary, not inside each browser call. `settledRead`
 * bounds a read; it does not bound a search, a click, a cart scrape or a form
 * fill, and every one of those is a `page.evaluate` that puppeteer will wait on
 * without limit when the thing it is aimed at has died. Auditing them one by
 * one would leave the next one added unguarded. There is exactly one place
 * every sandbox call passes through, and this is it.
 *
 * The live failure: a container's renderer crashed mid-errand, the service
 * relaunched, and the next call went down a pipe nobody was reading. No model
 * call in flight, no browser event, no step — and `ChatService`'s queue behind
 * it, so the shopper's next sentence could never run either. Their word was
 * "got stuck".
 *
 * Generous: a real page open plus its settle can take half a minute, and
 * cutting a slow shop short would lose readings the errand can use. This is
 * the line past which the page is not answering, it is gone.
 */
export const CALL_CEILING_MS = 60_000;

export class ToolCallTimeout extends Error {
  constructor(
    readonly tool: string,
    readonly afterMs: number,
  ) {
    super(`${tool} did not answer within ${afterMs}ms`);
    this.name = "ToolCallTimeout";
  }
}

/**
 * The call, or the ceiling, whichever lands first.
 *
 * A real timer for the same reason `settledRead` uses one: this is a watchdog,
 * and a watchdog measured in a clock a test can advance is not a watchdog. The
 * abandoned call is left to settle on its own — there is no way to cancel a
 * CDP command in flight, and waiting for it is precisely what is being avoided
 * — so what this guarantees is not that the promise ends, but that nothing
 * downstream is still waiting on it.
 */
export function withinCall<T>(
  work: Promise<T>,
  tool: string,
  ms: number = CALL_CEILING_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const ceiling = setTimeout(() => {
      reject(new ToolCallTimeout(tool, ms));
    }, ms);
    ceiling.unref?.();
    work.then(
      (value) => {
        clearTimeout(ceiling);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(ceiling);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}
