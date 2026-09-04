import type {
  PreToolUseHook,
  ToolCallDecision,
} from "../buyer/pre-tool-use-hook.js";
import { F2_BLOCK_HUMAN } from "../buyer/pre-tool-use-hook.js";
import type {
  AgentToolRequest,
  AgentToolResult,
  ToolDispatcher,
} from "../shared/agent-session.js";
import { toolCallOf } from "../shared/agent-session.js";

/**
 * F2, at the one place a tool call is executed.
 *
 * The provider API hands back a function call and trusts the caller to run
 * it. This class is that caller, and it is the only one: the adapter takes a
 * `GuardedToolDispatcher`, never a bare `ToolDispatcher`, so there is no
 * constructor anywhere in this package that can build a session with the
 * gate missing. The guarantee is a type, not a convention, and every
 * decision it makes lands in the same ledger the harness-driven loop in
 * `BuyerAgent` writes to.
 */
export class GuardedToolDispatcher {
  private readonly refused: ToolCallDecision[] = [];
  private readonly requests: AgentToolRequest[] = [];

  constructor(
    private readonly hook: PreToolUseHook,
    private readonly dispatcher: ToolDispatcher,
    private readonly txnId: string | null,
    /**
     * The tools that may run beside another, by name. Empty by default, so a
     * dispatcher told nothing behaves exactly as it always did: every call in
     * order, one at a time. A tool earns a place here by declaring itself
     * `concurrency: "parallel"`, which only a read with no shared state may do.
     */
    private readonly parallel: ReadonlySet<string> = new Set(),
  ) {}

  /** Every call the hook refused, in order. The demo reads this out loud. */
  get blocked(): readonly ToolCallDecision[] {
    return this.refused;
  }

  /** Every call the model asked for, allowed or not. The router reads argument
   *  well-formedness off this; it is a record, never a second gate. */
  get seen(): readonly AgentToolRequest[] {
    return this.requests;
  }

  /**
   * A denial aborts the call and comes back as an ordinary tool error, which
   * the adapter feeds to the model as that provider's tool-result message.
   * The model learns the call did not happen; it never learns a way to make it
   * happen, and it is never left waiting on a result that silently vanished.
   */
  async dispatch(request: AgentToolRequest): Promise<AgentToolResult> {
    const call = toolCallOf(request);
    this.requests.push(request);
    const decision = this.hook.evaluate(call, this.txnId);
    if (!decision.allowed) {
      this.refused.push(decision);
      return {
        toolUseId: request.toolUseId,
        content: decision.human ?? F2_BLOCK_HUMAN,
        isError: true,
      };
    }
    const outcome = await this.dispatcher.dispatch(call);
    return {
      toolUseId: request.toolUseId,
      content: outcome.content,
      isError: outcome.isError,
      ...(outcome.terminal === true ? { terminal: true } : {}),
      ...(outcome.image === undefined ? {} : { image: outcome.image }),
    };
  }

  /**
   * A turn's calls, in the order the model asked for them.
   *
   * DECISION: consecutive read-only calls go out together; anything else is a
   * barrier. This was strictly sequential, on the grounds that money-affecting
   * work is ordered and the ledger has to read back in the order it happened -
   * which is still true, and is exactly what the barrier preserves. What was
   * being paid for that guarantee was every unrelated read waiting its turn: a
   * model that asks to check the shelf, the window and six product pages at
   * once was served one after another for no reason any ledger cares about.
   *
   * Nothing here decides what a tool may do. Every call still goes through
   * `dispatch`, so `PreToolUseHook` judges each one exactly as before, and the
   * results come back in the order asked whatever order they finished in.
   */
  async dispatchAll(
    requests: readonly AgentToolRequest[],
  ): Promise<readonly AgentToolResult[]> {
    const results: AgentToolResult[] = [];
    for (const group of this.grouped(requests)) {
      const done =
        group.length === 1 && group[0] !== undefined
          ? [await this.dispatch(group[0])]
          : await Promise.all(group.map((call) => this.dispatch(call)));
      results.push(...done);
    }
    return results;
  }

  /**
   * Runs of calls that may go out together, in order. A serial call is a group
   * of one, which is what makes it a barrier: the group before it is awaited,
   * and the group after it has not started.
   */
  private grouped(
    requests: readonly AgentToolRequest[],
  ): readonly (readonly AgentToolRequest[])[] {
    const groups: AgentToolRequest[][] = [];
    for (const request of requests) {
      const last = groups[groups.length - 1];
      const beside =
        this.parallel.has(request.tool) &&
        last !== undefined &&
        last.every((held) => this.parallel.has(held.tool));
      if (beside && last !== undefined) last.push(request);
      else groups.push([request]);
    }
    return groups;
  }
}
