import type { Logger } from "@covenant/domain";

/**
 * Ops only. Anything that could move money — orders, payment links, refunds,
 * payouts — is refused at mount time, so the merchant agent cannot be talked
 * into a checkout through the Razorpay MCP server even though the server
 * itself is perfectly capable of one. F2 applies to the merchant side too.
 */
export const RZP_OPS_TOOLS: readonly string[] = [
  "fetch_all_orders",
  "fetch_order",
  "fetch_payment",
  "fetch_all_payments",
  "fetch_settlements",
  "fetch_all_items",
];

export const RZP_FORBIDDEN_TOOL_PATTERNS: readonly RegExp[] = [
  /^create_/,
  /payment_link/,
  /refund/,
  /payout/,
  /capture/,
];

export interface RazorpayMcpConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly keyId: string;
  readonly keySecret: string;
  readonly timeoutMs: number;
}

/** The SDK's `McpStdioServerConfig` shape, declared here so this file needs no
 *  SDK import — mounting is configuration, not a session. */
export interface StdioServerConfig {
  readonly type: "stdio";
  readonly command: string;
  readonly args: string[];
  readonly env: Record<string, string>;
  readonly timeout: number;
}

export function isOpsTool(tool: string): boolean {
  return (
    RZP_OPS_TOOLS.includes(tool) &&
    !RZP_FORBIDDEN_TOOL_PATTERNS.some((pattern) => pattern.test(tool))
  );
}

export class RazorpayMcpMount {
  constructor(
    private readonly config: RazorpayMcpConfig,
    private readonly logger: Logger,
  ) {}

  /** The `mcpServers` entry, plus the allowlist that must accompany it. */
  server(): StdioServerConfig {
    this.logger.info("merchant.rzp_mcp.mounted", {
      tools: RZP_OPS_TOOLS.length,
      command: this.config.command,
    });
    return {
      type: "stdio",
      command: this.config.command,
      args: [...this.config.args],
      env: {
        RAZORPAY_KEY_ID: this.config.keyId,
        RAZORPAY_KEY_SECRET: this.config.keySecret,
      },
      timeout: this.config.timeoutMs,
    };
  }

  /** `allowedTools` entries, MCP-prefixed for the named server. */
  allowedTools(serverName: string): readonly string[] {
    return RZP_OPS_TOOLS.filter(isOpsTool).map(
      (tool) => `mcp__${serverName}__${tool}`,
    );
  }
}
