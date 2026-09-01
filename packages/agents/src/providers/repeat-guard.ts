import type {
  AgentToolRequest,
  AgentToolResult,
} from "../shared/agent-session.js";

/** Tool, server and arguments — the whole of what makes two calls the same
 *  call. `\u0000` because no wire name contains it. */
export function signatureOf(request: AgentToolRequest): string {
  const args = JSON.stringify(request.args);
  return `${request.server}\u0000${request.tool}\u0000${args}`;
}

/**
 * A call that already failed, attempted again with the same arguments.
 *
 * DECISION: this exists beside `repeats()` rather than replacing it, because
 * they catch different shapes and only one of them was catching anything. The
 * `repeats()` guard compares a round against *the round before it*, so it
 * catches a model asking the same question twice in a row and nothing else. A
 * live errand looped `open amazon.in → search "1TB internal SSD laptop NVMe" →
 * open Crucial-P310`, three rounds long, and came round to die on the same page
 * it had already failed to read — every consecutive pair of rounds different,
 * every cycle identical, the guard silent throughout.
 *
 * DECISION: a failed call, not any repeat. Opening a page twice can be
 * legitimate — a checkout walks back through pages it has seen. Opening a page
 * that *refused to be read*, and asking it the same thing again, is not
 * progress; it is the model rediscovering a wall.
 *
 * DECISION: one grace. The first repeat is allowed, because a page that threw
 * once may settle and a retry is the cheapest possible fix. The round ends when
 * a call whose signature has already failed is attempted again — and only when
 * every call in the round is such a repeat, so a round that also tries
 * something new is a round making progress.
 */
/**
 * The same calls, with the same arguments, as the round before.
 *
 * A repeated call on an unchanged conversation returns the same answer, so a
 * round that asks for it again has made no progress — it has only written
 * another draft. One live turn spent twelve of them this way, the last three
 * byte-identical, and then committed a sentence that contradicted all twelve.
 */
function sameAs(
  previous: readonly AgentToolRequest[],
  next: readonly AgentToolRequest[],
): boolean {
  if (previous.length === 0 || previous.length !== next.length) {
    return false;
  }
  return next.every(
    (call, index) => signatureOf(call) === signature(previous[index]),
  );
}

function signature(request: AgentToolRequest | undefined): string {
  return request === undefined ? "" : signatureOf(request);
}

export class RepeatGuard {
  private readonly failed = new Set<string>();
  private last: readonly AgentToolRequest[] = [];

  /**
   * Nothing this round can teach the model anything: either it is the round
   * before it repeated, or every call in it has already failed once.
   *
   * Asked once per round and *before* dispatch, so a call's own first failure
   * never makes it look stuck. It advances the sequence it is tracking, which
   * is why it is a method on a guard rather than a free predicate.
   */
  noProgress(requests: readonly AgentToolRequest[]): boolean {
    const repeated = sameAs(this.last, requests);
    this.last = requests;
    return repeated || this.stuck(requests);
  }

  private stuck(requests: readonly AgentToolRequest[]): boolean {
    return (
      requests.length > 0 &&
      requests.every((request) => this.failed.has(signatureOf(request)))
    );
  }

  record(
    requests: readonly AgentToolRequest[],
    results: readonly AgentToolResult[],
  ): void {
    const errored = new Set(
      results.filter((result) => result.isError).map((r) => r.toolUseId),
    );
    for (const request of requests) {
      if (errored.has(request.toolUseId)) {
        this.failed.add(signatureOf(request));
      }
    }
  }
}
