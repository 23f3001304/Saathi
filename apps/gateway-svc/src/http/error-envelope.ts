import type { Clock, ReasonCode, ToPass } from "@covenant/domain";
import {
  DomainError,
  REASON_HUMAN,
  errorTypeOf,
  httpStatusOf,
  toIsoTimestamp,
} from "@covenant/domain";
import type { ErrorEnvelope } from "@covenant/gateway";

/**
 * The §4.6 envelope, built from the reason code and nothing else — the
 * catalog owns `type`, `human` and the status, so the transport invents no
 * taxonomy of its own.
 *
 * DECISION: a *policy* code reaching a route with no verdict body (a burned
 * payment nonce at `execute-payment`, a finalised transaction at
 * `cooloff/:id/cancel`) answers **200** with this envelope, not a 4xx. Why:
 * §4.6's rule is that a blocked action is a successful gateway response, and
 * only `verify-cart` has eight seals to say so with. The status comes from
 * `httpStatusOf`, which already maps the policy family to 200; `type` falls
 * back to `invalid_request` exactly as the `auth` family does.
 */
export function envelopeOf(
  reasonCode: ReasonCode,
  requestId: string,
  now: Date,
  toPass: ToPass | null,
): ErrorEnvelope {
  return {
    ok: false,
    error: {
      type: errorTypeOf(reasonCode) ?? "invalid_request",
      reason_code: reasonCode,
      human: REASON_HUMAN[reasonCode],
      to_pass: toPass === null ? null : { ...toPass },
      request_id: requestId,
      ts: toIsoTimestamp(now),
    },
  };
}

export interface EnvelopeReply {
  readonly status: number;
  readonly body: ErrorEnvelope;
}

export function replyFor(
  reasonCode: ReasonCode,
  requestId: string,
  clock: Clock,
  toPass: ToPass | null = null,
): EnvelopeReply {
  return {
    status: httpStatusOf(reasonCode),
    body: envelopeOf(reasonCode, requestId, clock.now(), toPass),
  };
}

/** Anything that is not a `DomainError` is a bug; it never leaks its stack. */
export function replyForThrown(
  cause: unknown,
  requestId: string,
  clock: Clock,
): EnvelopeReply {
  return cause instanceof DomainError
    ? replyFor(cause.reasonCode, requestId, clock, cause.toPass)
    : replyFor("LEDGER_WRITE_FAILED", requestId, clock, null);
}
