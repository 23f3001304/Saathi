import { z } from "zod";

import {
  GATEWAY_TOOL_SERVER,
  MERCHANT_TOOL_SERVER,
} from "../buyer/money-tool-registry.js";
import { CATALOG_TOOL_NAME } from "../merchant/catalog-tool.js";
import { QUOTE_TOOL_NAME } from "../merchant/quote-tool.js";
import type { AgentToolRequest } from "../shared/agent-session.js";
import type { ToolArgs } from "../shared/tool-envelope.js";

export type JsonSchemaObject = Readonly<Record<string, unknown>>;

/** One tool as the provider is told about it. */
export interface ToolDeclaration {
  readonly tool: string;
  readonly server: string;
  readonly description: string;
  readonly parameters: JsonSchemaObject;
  /**
   * Whether this tool may run beside another in the same turn. Absent means
   * `serial`, which is the only safe default: a tool nobody has thought about
   * is one that might touch the window, the shelf or the ledger.
   *
   * `parallel` is a claim about two things at once - that the tool only reads,
   * and that what it reads is not shared mutable state something else in the
   * turn could be changing. The window fails the second test even for a read,
   * because a read of a page another call is navigating is a read of neither
   * page. It is declared here, beside the schema, because that is where what a
   * tool IS gets written down.
   */
  readonly concurrency?: "parallel" | "serial";
}

/** The tools in a set that may go out together. */
export function parallelToolNames(
  declarations: readonly ToolDeclaration[],
): ReadonlySet<string> {
  return new Set(
    declarations
      .filter((declaration) => declaration.concurrency === "parallel")
      .map((declaration) => declaration.tool),
  );
}

/** A tool with no `mcp__` prefix comes from the harness itself, not from a
 *  server: it can only ever resolve to the built-in server, which offers no
 *  money tool, so `PreToolUseHook` refuses it on the registry's fail-closed
 *  default. */
export const BUILTIN_TOOL_SERVER = "builtin";

/**
 * The wire name a provider sees: `mcp__<server>__<tool>`, the MCP naming
 * convention. `parseWireToolName` reads it straight back, so the adapter hands
 * `PreToolUseHook` exactly the `(tool, server)` pair it declared, and it is a
 * legal function name under OpenAI's `^[A-Za-z0-9_-]+$` rule.
 */
export function wireNameOf(declaration: ToolDeclaration): string {
  return `mcp__${declaration.server}__${declaration.tool}`;
}

/**
 * Wire names are `mcp__<server>__<tool>`; built-ins are bare. Splitting on the
 * prefix is what lets the registry ask "which server is offering this", which
 * is the question AM2 and F2 both turn on.
 */
export function parseWireToolName(toolName: string): {
  tool: string;
  server: string;
} {
  const parts = toolName.split("__");
  const [prefix, server] = parts;
  if (parts.length >= 3 && prefix === "mcp" && server !== undefined) {
    return { server, tool: parts.slice(2).join("__") };
  }
  return { server: BUILTIN_TOOL_SERVER, tool: toolName };
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
  const { server, tool } = parseWireToolName(wireName);
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
 * The buyer's tool surface. The merchant half mirrors the zod shapes the
 * merchant agent parses; the gateway half is the money surface of
 * `GATEWAY_MONEY_TOOLS`, declared so that the F2 block has something real to
 * be proven against: a registry that only ever sees non-money tools proves
 * nothing.
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
