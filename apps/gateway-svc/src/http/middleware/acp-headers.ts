import type { Clock, MandateRole, ReasonCode } from "@covenant/domain";
import { roleOfKid } from "@covenant/domain";
import type { AdmissionGate } from "@covenant/gateway";
import { parseSignatureHeader } from "@covenant/gateway";
import type { PinnedJwkResolver } from "@covenant/mandates";
import type { MiddlewareHandler } from "hono";

import type { GatewayConfig } from "../../config.js";
import type { AppEnv } from "../app-env.js";
import { API_VERSION_HEADER, REQUEST_ID_HEADER } from "../app-env.js";
import { replyFor } from "../error-envelope.js";

export interface AdmissionDeps {
  readonly config: GatewayConfig;
  readonly clock: Clock;
  readonly gate: AdmissionGate;
  readonly keys: PinnedJwkResolver;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A GET is a read-only projection and the demo has no per-user auth (§4.2), so
 * it presents `Request-Id` and `API-Version` and nothing else. Both are still
 * fail-closed: `API-Version` pins the semantic version, and a client that
 * upgrades the path without it is the exact failure the pin exists to prevent.
 */
export function readHeaders(deps: AdmissionDeps): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const failure = readFailureOf(context.req.header(REQUEST_ID_HEADER) ?? null,
      context.req.header(API_VERSION_HEADER) ?? null, deps.config.apiVersion);
    if (failure !== null) {
      const reply = replyFor(failure, context.get("requestId"), deps.clock);
      return context.json(reply.body, reply.status as 400);
    }
    await next();
    return undefined;
  };
}

function readFailureOf(
  requestId: string | null,
  apiVersion: string | null,
  expected: string,
): ReasonCode | null {
  if (requestId === null || !UUID_PATTERN.test(requestId)) {
    return "REQUEST_ID_MISSING";
  }
  return apiVersion === expected ? null : "API_VERSION_UNSUPPORTED";
}

/**
 * Stage 0 for every write route: the five ACP headers, the exact API version,
 * a ±300 s timestamp and an ES256 signature over the §4.2 canonical base
 * string — verified against the pinned trust ring, over the **raw bytes**
 * captured before any JSON parse.
 *
 * DECISION: the signing issuer is resolved from the `keyid` in the `Signature`
 * header (kid → role → the ring's issuer URN) rather than configured per
 * route. Why: the trust ring is the only place that says which URN owns which
 * kid, and a second, route-local mapping would be a second trust decision
 * about the same signature. `roles` then pins *which* of them a route accepts,
 * so `covenant/sign` still demands the user key (§4.1).
 */
export function signedBody(
  deps: AdmissionDeps,
  roles: readonly MandateRole[] = ["user", "merchant", "gateway"],
): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const rawBody = await context.req.text();
    const parsedBody = safeJson(rawBody);
    const admission = deps.gate.admit({
      method: context.req.method,
      path: context.req.path,
      rawBody,
      parsedBody,
      issuer: issuerOf(deps, context.req.header("Signature") ?? null, roles),
      headers: acpHeadersOf(context),
    });
    if (admission.status === "rejected") {
      const reply = replyFor(admission.reasonCode, context.get("requestId"), deps.clock);
      return context.json(reply.body, reply.status as 400);
    }
    context.set("admitted", { ...admission, parsedBody, rawBody });
    await next();
    return undefined;
  };
}

function acpHeadersOf(context: Parameters<MiddlewareHandler<AppEnv>>[0]) {
  return {
    idempotencyKey: context.req.header("Idempotency-Key") ?? null,
    requestId: context.req.header(REQUEST_ID_HEADER) ?? null,
    signature: context.req.header("Signature") ?? null,
    timestamp: context.req.header("Timestamp") ?? null,
    apiVersion: context.req.header(API_VERSION_HEADER) ?? null,
  };
}

/** `""` when the kid is unknown or its role is not accepted here: fail closed. */
function issuerOf(
  deps: AdmissionDeps,
  signature: string | null,
  roles: readonly MandateRole[],
): string {
  const header = signature === null ? null : parseSignatureHeader(signature);
  const role = header === null ? null : roleOfKid(header.keyid);
  if (role === null || !roles.includes(role)) {
    return "";
  }
  return deps.keys.issuerFor(role) ?? "";
}

function safeJson(raw: string): unknown {
  try {
    return raw === "" ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
