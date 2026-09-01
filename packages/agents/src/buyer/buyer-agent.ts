import type { Logger } from "@covenant/domain";

import type {
  AgentSession,
  AgentToolRequest,
  AgentToolResult,
  ToolDispatcher,
} from "../shared/agent-session.js";
import { toolCallOf } from "../shared/agent-session.js";
import type { CheckoutOutcome, CheckoutRequest } from "./checkout.js";
import type { Checkout } from "./checkout.js";
import type { PreToolUseHook, ToolCallDecision } from "./pre-tool-use-hook.js";

export interface BuyerAgentConfig {
  readonly maxTurns: number;
  readonly txnId: string | null;
}

export interface ConversationResult {
  readonly transcript: readonly string[];
  /** Every call the hook refused, in order. The demo reads this out loud. */
  readonly blocked: readonly ToolCallDecision[];
  readonly turns: number;
  readonly completed: boolean;
}

/**
 * Owns the session, the tool gate and the negotiate → confirm → pay loop.
 *
 * Every tool request passes through `PreToolUseHook` before it can reach a
 * dispatcher. That ordering is the whole of F2: the model is told about the
 * rule in `BUYER_SYSTEM_PROMPT`, but the rule is *applied* here, where no
 * prompt can reach it.
 */
export class BuyerAgent {
  constructor(
    private readonly session: AgentSession,
    private readonly hook: PreToolUseHook,
    private readonly dispatcher: ToolDispatcher,
    private readonly checkout: Checkout,
    private readonly logger: Logger,
    private readonly config: BuyerAgentConfig,
  ) {}

  async converse(userMessage: string): Promise<ConversationResult> {
    const transcript: string[] = [];
    const blocked: ToolCallDecision[] = [];
    let pending: readonly AgentToolResult[] = [];
    let first = true;
    let turns = 0;
    while (turns < this.config.maxTurns) {
      const turn = await this.session.turn({
        userMessage: first ? userMessage : null,
        toolResults: [...pending],
      });
      turns += 1;
      first = false;
      transcript.push(turn.text);
      if (turn.done || turn.toolRequests.length === 0) {
        return { transcript, blocked, turns, completed: true };
      }
      pending = await this.runTools(turn.toolRequests, blocked);
    }
    this.logger.warn("buyer.turn_budget_exhausted", { turns });
    return { transcript, blocked, turns, completed: false };
  }

  /**
   * Abandon this conversation. The caller stopped awaiting a turn — an errand
   * that ran past its wall clock — and the half-finished exchange behind it
   * must not become the opening of the next question's.
   */
  async reset(): Promise<void> {
    await this.session.close();
  }

  purchase(request: CheckoutRequest): Promise<CheckoutOutcome> {
    return this.checkout.run(request);
  }

  private async runTools(
    requests: readonly AgentToolRequest[],
    blocked: ToolCallDecision[],
  ): Promise<readonly AgentToolResult[]> {
    const results: AgentToolResult[] = [];
    for (const request of requests) {
      results.push(await this.runOne(request, blocked));
    }
    return results;
  }

  /**
   * A blocked call comes back as an ordinary tool error. The model learns that
   * the call did not happen; it never learns a way to make it happen.
   */
  private async runOne(
    request: AgentToolRequest,
    blocked: ToolCallDecision[],
  ): Promise<AgentToolResult> {
    const call = toolCallOf(request);
    const decision = this.hook.evaluate(call, this.config.txnId);
    if (!decision.allowed) {
      blocked.push(decision);
      return {
        toolUseId: request.toolUseId,
        content: decision.human ?? "blocked",
        isError: true,
      };
    }
    const outcome = await this.dispatcher.dispatch(call);
    return {
      toolUseId: request.toolUseId,
      content: outcome.content,
      isError: outcome.isError,
    };
  }
}
