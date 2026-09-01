import type { Clock, ReasonCode, ToPass } from "@covenant/domain";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppContext } from "../app-env.js";
import type { EnvelopeReply } from "../error-envelope.js";
import { replyFor } from "../error-envelope.js";

/** One place where a §4.6 envelope becomes an HTTP response. */
export function sendEnvelope(context: AppContext, reply: EnvelopeReply): Response {
  return context.json(reply.body, reply.status as ContentfulStatusCode);
}

export function sendReason(
  context: AppContext,
  clock: Clock,
  reasonCode: ReasonCode,
  toPass: ToPass | null = null,
): Response {
  return sendEnvelope(
    context,
    replyFor(reasonCode, context.get("requestId"), clock, toPass),
  );
}

/**
 * Every request schema is `.strict()`: an unknown key is a rejection, not an
 * ignore — AM5 applied to the transport as well as to `risk_data` (§4.3).
 */
export interface Parsed<T> {
  readonly ok: boolean;
  readonly value: T | null;
}

export function parsedOf<T>(result: {
  success: boolean;
  data?: T;
}): Parsed<T> {
  return { ok: result.success, value: result.data ?? null };
}

export function positiveInt(raw: string | undefined, fallback: number, max: number): number {
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}
