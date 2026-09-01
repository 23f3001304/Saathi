import type { IsoTimestamp, Sha256Ref } from "@covenant/domain";
import { sha256RefOf } from "@covenant/domain";

import type { Ap2AgentRole } from "./agent-instance.js";

export type ToolArgs = Readonly<Record<string, unknown>>;

/**
 * One MCP call as the harness sees it. `server` is carried separately from
 * `tool` because AM2 pins a tool to the server that may serve it: a
 * `verify_cart` offered by the merchant server is a different call from the
 * gateway's, and only the pair identifies it.
 */
export interface ToolCall {
  readonly tool: string;
  readonly server: string;
  readonly args: ToolArgs;
}

/** AM2's signed envelope claim set (§2.7). */
export interface ToolEnvelopeClaims {
  readonly caller: string;
  readonly ap2_role: Ap2AgentRole;
  readonly tool: string;
  readonly server: string;
  readonly args_hash: Sha256Ref;
  readonly ts: IsoTimestamp;
  readonly nonce: string;
}

export interface SignedToolEnvelope {
  readonly jws: string;
  readonly claims: ToolEnvelopeClaims;
}

/** RFC 8785 canonical hash, so key order in `args` cannot change the envelope. */
export function argsHashOf(args: ToolArgs): Sha256Ref {
  return sha256RefOf(args);
}

export const TOOL_ENVELOPE_TTL_SECONDS = 120;

export const TOOL_ENVELOPE_AUDIENCE = "urn:covenant:tool";

const CLAIM_KEYS: readonly string[] = [
  "caller",
  "ap2_role",
  "tool",
  "server",
  "args_hash",
  "ts",
  "nonce",
];

function isStringAt(source: Record<string, unknown>, key: string): boolean {
  return typeof source[key] === "string";
}

/** Reads the envelope claims out of a verified JWT payload, or `null`. */
export function readEnvelopeClaims(
  claims: Readonly<Record<string, unknown>>,
): ToolEnvelopeClaims | null {
  const source = claims as Record<string, unknown>;
  if (!CLAIM_KEYS.every((key) => isStringAt(source, key))) {
    return null;
  }
  return {
    caller: source["caller"] as string,
    ap2_role: source["ap2_role"] as Ap2AgentRole,
    tool: source["tool"] as string,
    server: source["server"] as string,
    args_hash: source["args_hash"] as Sha256Ref,
    ts: source["ts"] as IsoTimestamp,
    nonce: source["nonce"] as string,
  };
}
