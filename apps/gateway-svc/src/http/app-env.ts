import type { Sha256Hex, Span } from "@covenant/domain";
import type { Context } from "hono";

/** What the middleware chain establishes before a route ever runs. */
export interface Admitted {
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: Sha256Hex;
  readonly parsedBody: unknown;
  readonly rawBody: string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    tenantId: string;
    span: Span;
    admitted: Admitted;
  };
}

export type AppContext = Context<AppEnv>;

export const REQUEST_ID_HEADER = "Request-Id";

export const API_VERSION_HEADER = "API-Version";

export const IDEMPOTENT_REPLAY_HEADER = "Idempotent-Replay";

/**
 * The signed base string binds the path **without** its query string (§4.2),
 * and Hono's `c.req.path` is already query-free.
 */
export function signedPathOf(context: AppContext): string {
  return context.req.path;
}

export function headerOf(context: AppContext, name: string): string | null {
  return context.req.header(name) ?? null;
}
