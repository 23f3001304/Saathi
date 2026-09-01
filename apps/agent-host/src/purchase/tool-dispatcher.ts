import type {
  GatewayBody,
  GatewayClient,
  GatewayResult,
  ToolCall,
  ToolDispatcher,
  ToolOutcome,
} from "@covenant/agents";
import { CATALOG_TOOL_NAME, QUOTE_TOOL_NAME } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";
import type { z } from "zod";

import type { MerchantToolRunner } from "./merchant-tool-runner.js";
import { isWebTool } from "./web-tool-runner.js";
import type { WebToolRunner } from "./web-tool-runner.js";
import {
  catalogArgs,
  memoryRetrieveArgs,
  memoryWriteArgs,
  quoteArgs,
} from "./tool-args.js";
import type { ToolLog } from "./tool-log.js";

export const MEMORY_WRITE_TOOL = "memory_write";

export const MEMORY_RETRIEVE_TOOL = "memory_retrieve";

export interface DispatcherConfig {
  readonly userId: string;
}

function badArgs(error: z.ZodError): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "bad_arguments",
      issues: error.issues,
    }),
    isError: true,
  };
}

function resultOf<T>(result: GatewayResult<T>): ToolOutcome {
  return result.ok
    ? { content: JSON.stringify(result.value), isError: false }
    : { content: JSON.stringify(result.failure), isError: true };
}

/**
 * What actually runs an allowed tool call. It sits *after* `PreToolUseHook`, so
 * every entry point here has already been judged; nothing in this file may
 * re-decide that, and nothing may reach a payment rail — the only egress it
 * knows is `GatewayClient`.
 *
 * DECISION: a rejected memory write comes back as a tool **error** carrying the
 * gateway's own reason code and human sentence, not as a thrown exception. Why:
 * a rejection is the system working (§7.2), and the session has to be able to
 * read what happened and say it out loud — which is the difference between an
 * agent that was stopped and an agent that can explain that it was stopped.
 */
export class AgentToolDispatcher implements ToolDispatcher {
  constructor(
    private readonly merchant: MerchantToolRunner,
    private readonly web: WebToolRunner,
    private readonly gateway: GatewayClient,
    private readonly log: ToolLog,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: DispatcherConfig,
  ) {}

  dispatch(call: ToolCall): Promise<ToolOutcome> {
    this.logger.debug("tool.dispatch", {
      tool: call.tool,
      server: call.server,
    });
    // Routed by name rather than by a case per tool: the five browser tools
    // share one runner, and listing them twice would be two places to forget.
    if (isWebTool(call.tool)) {
      return this.web.run(call);
    }
    switch (call.tool) {
      case CATALOG_TOOL_NAME:
        return this.search(call);
      case QUOTE_TOOL_NAME:
        return this.quote(call);
      case MEMORY_WRITE_TOOL:
        return this.writeMemory(call);
      case MEMORY_RETRIEVE_TOOL:
        return this.retrieveMemory(call);
      default:
        return Promise.resolve(unknownTool(call));
    }
  }

  private search(call: ToolCall): Promise<ToolOutcome> {
    const parsed = catalogArgs.safeParse(call.args);
    return parsed.success
      ? this.merchant.search(parsed.data)
      : Promise.resolve(badArgs(parsed.error));
  }

  private quote(call: ToolCall): Promise<ToolOutcome> {
    const parsed = quoteArgs.safeParse(call.args);
    return parsed.success
      ? this.merchant.quote(parsed.data)
      : Promise.resolve(badArgs(parsed.error));
  }

  private async writeMemory(call: ToolCall): Promise<ToolOutcome> {
    const parsed = memoryWriteArgs.safeParse(call.args);
    if (!parsed.success) {
      return badArgs(parsed.error);
    }
    const body: GatewayBody = {
      ...parsed.data,
      t_valid: this.clock.now().toISOString(),
      t_invalid: null,
      user_id: this.config.userId,
    };
    const written = await this.gateway.writeMemory(body);
    if (written.ok) {
      this.log.recordWrite({
        type: parsed.data.type,
        tierClaim: parsed.data.tier_claim,
        channel: parsed.data.source_channel,
        body: written.value,
      });
    }
    return this.reportWrite(written);
  }

  private retrieveMemory(call: ToolCall): Promise<ToolOutcome> {
    const parsed = memoryRetrieveArgs.safeParse(call.args);
    if (!parsed.success) {
      return Promise.resolve(badArgs(parsed.error));
    }
    return this.gateway
      .retrieveMemory({
        ...parsed.data,
        as_of: null,
        user_id: this.config.userId,
      })
      .then(resultOf);
  }

  private reportWrite(
    written: GatewayResult<{ status: string; reason_code: string | null }>,
  ): ToolOutcome {
    if (!written.ok) {
      return resultOf(written);
    }
    const rejected = written.value.status === "rejected";
    if (rejected) {
      this.logger.warn("memory.write.rejected", {
        reason_code: written.value.reason_code,
      });
    }
    return { content: JSON.stringify(written.value), isError: rejected };
  }
}

function unknownTool(call: ToolCall): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: false,
      failure: "unknown_tool",
      tool: call.tool,
      server: call.server,
    }),
    isError: true,
  };
}
