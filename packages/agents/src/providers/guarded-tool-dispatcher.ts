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
 * F2 for every provider that is not Claude.
 *
 * The Claude path gets its interception from the Agent SDK's `PreToolUse`
 * hook (§10.2 hook 1). OpenAI, Gemini and Sarvam have no such hook: their
 * APIs hand back a function call and trust the caller to run it. This class
 * is that caller, and it is the only one — the provider adapters take a
 * `GuardedToolDispatcher`, never a bare `ToolDispatcher`, so there is no
 * constructor anywhere in this package that can build an adapter with the
 * gate missing. The guarantee is a type, not a convention.
 *
 * It holds the same `PreToolUseHook` instance the SDK path holds, so the block
 * matrix proven in tests is the block matrix that runs live on all four
 * providers, and every decision lands in the same ledger.
 */
export class GuardedToolDispatcher {
  private readonly refused: ToolCallDecision[] = [];
  private readonly requests: AgentToolRequest[] = [];

  constructor(
    private readonly hook: PreToolUseHook,
    private readonly dispatcher: ToolDispatcher,
    private readonly txnId: string | null,
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

  /** Sequential on purpose: a model may emit parallel calls, but money-affecting
   *  work is ordered, and the ledger has to read back in the order it happened. */
  async dispatchAll(
    requests: readonly AgentToolRequest[],
  ): Promise<readonly AgentToolResult[]> {
    const results: AgentToolResult[] = [];
    for (const request of requests) {
      results.push(await this.dispatch(request));
    }
    return results;
  }
}
