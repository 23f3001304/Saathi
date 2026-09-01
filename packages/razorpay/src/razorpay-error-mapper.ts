import type { AcpErrorType, ReasonCode } from "@covenant/domain";
import { DomainError } from "@covenant/domain";

/**
 * The task spec's four categories, narrowed from the full six-member
 * `AcpErrorType`: a Razorpay HTTP failure never surfaces as `invalid_card`
 * (a checkout-time card decline, reported through the payment's own
 * `error_code`, not an API-call failure) or `idempotency_conflict` (that is
 * the gateway's own `nonces` table, not Razorpay's).
 */
export type RazorpayAcpErrorType = Extract<
  AcpErrorType,
  | "rate_limit_exceeded"
  | "processing_error"
  | "service_unavailable"
  | "invalid_request"
>;

/**
 * Razorpay's documented error envelope (verified live: `docs/errors/` +
 * `docs/api/payments/fetch-with-id`): `{ error: { code, description, field?,
 * source?, step?, reason?, metadata? } }`. `code` is always one string like
 * `BAD_REQUEST_ERROR` — confirmed by an unauthenticated live probe against
 * `POST /v1/orders`, which returned HTTP 401 with `error.code
 * "BAD_REQUEST_ERROR"`, so the HTTP status, not `error.code`, is what we
 * classify on.
 */
export interface RazorpayApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly description: string;
  };
}

export function isRazorpayApiErrorBody(
  value: unknown,
): value is RazorpayApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const err = (value as Record<string, unknown>)["error"];
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Record<string, unknown>)["code"] === "string" &&
    typeof (err as Record<string, unknown>)["description"] === "string"
  );
}

/**
 * Maps Razorpay HTTP status codes onto the ACP error taxonomy (A.1) and then
 * onto one frozen domain `ReasonCode`. Verified live against
 * `docs/api/understand.md`: 400 -> Bad Request, 401 -> Unauthorized,
 * 429 -> "Throttling Error", 500 -> Internal Server Error, 502/503/504 ->
 * gateway/service-down family. `status === null` means the call never got an
 * HTTP response at all (network failure, DNS, or our own client timeout).
 */
export class RazorpayErrorMapper {
  classifyAcpType(status: number | null): RazorpayAcpErrorType {
    if (status === null) {
      return "service_unavailable";
    }
    if (status === 429) {
      return "rate_limit_exceeded";
    }
    if (status === 500) {
      return "processing_error";
    }
    if (status >= 502 && status <= 504) {
      return "service_unavailable";
    }
    if (status >= 400 && status < 500) {
      // Includes 401: a bad key pair is a non-retryable client-side
      // configuration problem, not an AP2 mandate signature failure, so it
      // is reported as a malformed request rather than borrowing the
      // domain's `auth` family (which is about mandate signatures).
      return "invalid_request";
    }
    return "service_unavailable";
  }

  /**
   * `service_unavailable` and `processing_error` both fold onto
   * `RAZORPAY_UNAVAILABLE`. DECISION: the frozen reason-code catalog
   * (`domain/src/reason-code.ts`) has no Razorpay-specific code under
   * `processing_error` — that family exists for the gateway's own ledger
   * failures (`LEDGER_WRITE_FAILED`, `RECONCILIATION_DRIFT`, …), none of
   * which describe a third-party rail returning a 500. Both cases are
   * handled identically downstream anyway (retry, then park after three
   * failures per §2.5), so collapsing them is a distinction that would
   * carry no different behaviour even if a code existed.
   */
  toDomainError(status: number | null, body: unknown = null): DomainError {
    // Razorpay reuses 429 for two different facts: throttling, which a short
    // wait cures, and the test-mode lifetime cap, which no wait ever will.
    // "Retry after a short wait" on the second is false twice over, so the
    // description is the only place the two can be told apart.
    if (status === 429 && isExhaustedQuota(body)) {
      return new DomainError("RAIL_QUOTA_EXHAUSTED");
    }
    const acpType = this.classifyAcpType(status);
    return new DomainError(this.reasonCodeFor(acpType));
  }

  /** Only network/timeout and 5xx failures are safe to retry (§2.5); every 4xx is not. */
  isRetryable(error: unknown): boolean {
    return (
      error instanceof DomainError &&
      error.reasonCode === "RAZORPAY_UNAVAILABLE"
    );
  }

  private reasonCodeFor(acpType: RazorpayAcpErrorType): ReasonCode {
    switch (acpType) {
      case "rate_limit_exceeded":
        return "RATE_LIMITED";
      case "invalid_request":
        return "SCHEMA_VIOLATION";
      case "processing_error":
      case "service_unavailable":
        return "RAZORPAY_UNAVAILABLE";
    }
  }
}

function isExhaustedQuota(body: unknown): boolean {
  return (
    isRazorpayApiErrorBody(body) &&
    body.error.description.toLowerCase().includes("limit of") &&
    body.error.description.toLowerCase().includes("reached")
  );
}
