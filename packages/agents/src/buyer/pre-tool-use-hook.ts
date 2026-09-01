import type { EventSink, Logger, Tracer } from "@covenant/domain";

import type { ToolCall } from "../shared/tool-envelope.js";
import type { MoneyToolRegistry } from "./money-tool-registry.js";

export const F2_BLOCK_REASON = "money_tool_not_gateway_client";

export const F2_BLOCK_HUMAN =
  "That tool moves money and does not belong to the covenant gateway, so the agent is not allowed to call it.";

export interface ToolCallDecision {
  readonly allowed: boolean;
  readonly moneyAffecting: boolean;
  readonly reason: string;
  readonly human: string | null;
  readonly eventId: string;
}

export interface PreToolUseHookConfig {
  readonly tenantId: string;
  /** `T-*` when the harness is driving; `null` in ordinary operation. */
  readonly attackId: string | null;
}

/**
 * F2 enforcement, in harness code rather than in the prompt. The agent cannot
 * be talked out of this: the model never sees the decision, it sees a tool
 * result that says the call did not happen. Both outcomes are ledgered —
 * an allow that leaves no trace is indistinguishable from no check at all.
 */
export class PreToolUseHook {
  constructor(
    private readonly registry: MoneyToolRegistry,
    private readonly sink: EventSink,
    private readonly logger: Logger,
    private readonly tracer: Tracer,
    private readonly config: PreToolUseHookConfig,
  ) {}

  evaluate(call: ToolCall, txnId: string | null): ToolCallDecision {
    const moneyAffecting = this.registry.isMoneyAffecting(call.tool);
    const allowed =
      !moneyAffecting || this.registry.targetsGatewayClient(call);
    const span = this.tracer.startSpan("hook.pre_tool_use", {
      "covenant.tenant_id": this.config.tenantId,
      "covenant.actor": "buyer_agent",
      "covenant.tool": call.tool,
      "covenant.tool_server": call.server,
      "covenant.money_affecting": moneyAffecting,
    });
    try {
      return this.record(call, txnId, moneyAffecting, allowed);
    } finally {
      // A blocked call is the system working, so the span is never `error`.
      span.setStatus("ok");
      span.end();
    }
  }

  private record(
    call: ToolCall,
    txnId: string | null,
    moneyAffecting: boolean,
    allowed: boolean,
  ): ToolCallDecision {
    const reason = allowed ? "gateway_client" : F2_BLOCK_REASON;
    const eventId = this.append(call, txnId, moneyAffecting, allowed, reason);
    this.log(call, moneyAffecting, allowed, reason);
    return {
      allowed,
      moneyAffecting,
      reason,
      human: allowed ? null : F2_BLOCK_HUMAN,
      eventId,
    };
  }

  private append(
    call: ToolCall,
    txnId: string | null,
    moneyAffecting: boolean,
    allowed: boolean,
    reason: string,
  ): string {
    return this.sink.append({
      tenant_id: this.config.tenantId,
      actor: "buyer_agent",
      kind: allowed ? "tool.call.allowed" : "tool.call.blocked",
      txn_id: txnId,
      request_id: null,
      mandate_id: null,
      payload: {
        tool: call.tool,
        server: call.server,
        money_affecting: moneyAffecting,
        reason,
        detail_kind: "pre_tool_use",
        attack_id: this.config.attackId,
        human: allowed ? null : F2_BLOCK_HUMAN,
      },
    }).id;
  }

  /** A blocked attack is `warn`: `error` would mean the system is failing. */
  private log(
    call: ToolCall,
    moneyAffecting: boolean,
    allowed: boolean,
    reason: string,
  ): void {
    const fields = {
      tool: call.tool,
      server: call.server,
      money_affecting: moneyAffecting,
      reason,
    };
    if (allowed) {
      this.logger.debug("tool.call.allowed", fields);
      return;
    }
    this.logger.warn("tool.call.blocked", fields);
  }
}
