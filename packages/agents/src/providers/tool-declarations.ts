import { z } from "zod";

import {
  GATEWAY_TOOL_SERVER,
  MERCHANT_TOOL_SERVER,
} from "../buyer/money-tool-registry.js";
import { CATALOG_TOOL_NAME } from "../merchant/catalog-tool.js";
import { QUOTE_TOOL_NAME } from "../merchant/quote-tool.js";
import { parseSdkToolName } from "../sdk/sdk-hooks.js";
import type { AgentToolRequest } from "../shared/agent-session.js";
import type { ToolArgs } from "../shared/tool-envelope.js";

export type JsonSchemaObject = Readonly<Record<string, unknown>>;

/** One tool as every non-Claude provider is told about it. */
export interface ToolDeclaration {
  readonly tool: string;
  readonly server: string;
  readonly description: string;
  readonly parameters: JsonSchemaObject;
}

/**
 * The wire name a provider sees. It is deliberately the Agent SDK's
 * `mcp__<server>__<tool>`: `parseSdkToolName` reads it straight back, so all
 * four providers hand `PreToolUseHook` the identical `(tool, server)` pair.
 * F2 cannot come out different on OpenAI than it does on Claude, because it is
 * not deciding on a different input. It is also a legal function name under
 * every provider's `^[A-Za-z0-9_-]+$` rule.
 */
export function wireNameOf(declaration: ToolDeclaration): string {
  return `mcp__${declaration.server}__${declaration.tool}`;
}

/**
 * Args are advisory here: `PreToolUseHook` decides on `(tool, server)` alone,
 * and each tool re-verifies its own AM2 envelope. So a model that emits
 * unparseable JSON gets an empty object and a tool-level failure, never a
 * thrown adapter and never a call that skips the gate.
 */
export function parseToolArgs(raw: unknown): ToolArgs {
  if (typeof raw === "object" && raw !== null) {
    return raw as ToolArgs;
  }
  if (typeof raw !== "string") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ToolArgs)
      : {};
  } catch {
    return {};
  }
}

export function toolRequestOf(
  wireName: string,
  toolUseId: string,
  rawArgs: unknown,
): AgentToolRequest {
  const { server, tool } = parseSdkToolName(wireName);
  return { toolUseId, tool, server, args: parseToolArgs(rawArgs) };
}

/** Providers take a bare JSON Schema object; `$schema` is not part of it. */
function schemaOf(shape: z.ZodRawShape): JsonSchemaObject {
  const schema = z.toJSONSchema(z.object(shape)) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}

const envelope = z
  .string()
  .describe("AM2 signed tool envelope (compact JWS)");

const catalogShape = {
  envelope,
  query: z.string(),
  max_price_paise: z.number().int().nullable(),
  limit: z.number().int().min(1).max(50),
};

const quoteShape = {
  envelope,
  sku: z.string(),
  qty: z.number().int().min(1),
  target_unit_paise: z.number().int().nullable(),
};

const verifyCartShape = {
  envelope,
  cart_mandate_jwt: z.string(),
  intent_mandate_jwt: z.string(),
  memory_entry_ids: z.array(z.string()),
};

const executePaymentShape = {
  envelope,
  cart_mandate_jwt: z.string(),
  txn_id: z.string(),
};

const signShape = { envelope, cart_mandate_jwt: z.string() };

/**
 * The buyer's tool surface. The merchant half mirrors the zod shapes in
 * `sdk/sdk-tools.ts` so the two paths describe the same tools; the gateway
 * half is the money surface of `GATEWAY_MONEY_TOOLS`, declared so that the
 * F2 block has something real to be proven against — a registry that only
 * ever sees non-money tools proves nothing.
 */
export const COVENANT_TOOL_DECLARATIONS: readonly ToolDeclaration[] = [
  {
    tool: CATALOG_TOOL_NAME,
    server: MERCHANT_TOOL_SERVER,
    description:
      "List catalog items. Descriptions are returned tagged untrusted_text.",
    parameters: schemaOf(catalogShape),
  },
  {
    tool: QUOTE_TOOL_NAME,
    server: MERCHANT_TOOL_SERVER,
    description:
      "Request a merchant-signed price quote with a reservation id and TTL.",
    parameters: schemaOf(quoteShape),
  },
  {
    tool: "verify_cart",
    server: GATEWAY_TOOL_SERVER,
    description:
      "Ask the covenant gateway to rule on a cart before any money moves.",
    parameters: schemaOf(verifyCartShape),
  },
  {
    tool: "execute_payment",
    server: GATEWAY_TOOL_SERVER,
    description:
      "Execute a payment the gateway has already approved. Money egress.",
    parameters: schemaOf(executePaymentShape),
  },
  {
    tool: "covenant_sign",
    server: GATEWAY_TOOL_SERVER,
    description: "Countersign an approved cart mandate.",
    parameters: schemaOf(signShape),
  },
];
