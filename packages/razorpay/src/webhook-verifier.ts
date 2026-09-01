import { createHmac, timingSafeEqual } from "node:crypto";
import type { RazorpayWebhookEvent } from "./dto/webhook-event-dto.js";
import { parseWebhookEvent } from "./dto/webhook-event-dto.js";

export interface WebhookVerificationResult {
  readonly valid: boolean;
  /** `null` when invalid, or when valid but the event type/shape is unrecognised. */
  readonly event: RazorpayWebhookEvent | null;
}

/**
 * DECISION: the design (§2.4) places `RazorpayWebhookVerifier` inside
 * `packages/gateway`, where it appends a ledger event inside a
 * `LedgerTransaction`. This task's ownership boundary is `packages/razorpay`
 * only, and `razorpay -> domain` (no `ledger`) is enforced by depcruise, so
 * this class does verification + typed parsing ONLY. `packages/gateway`'s
 * future `WebhookService` composes this with `EventSink`/`LedgerTransaction`.
 *
 * Verified live (`docs/webhooks/validate-test`): HMAC-SHA256 of the *raw*
 * request body bytes, keyed by the webhook secret, compared against the
 * `X-Razorpay-Signature` header. "Do not parse or cast the webhook request
 * body" before hashing — `rawBody` here must be the exact bytes received.
 */
export class RazorpayWebhookVerifier {
  constructor(private readonly webhookSecret: string) {}

  verify(rawBody: string, signatureHeader: string | null): WebhookVerificationResult {
    if (signatureHeader === null || !this.signatureMatches(rawBody, signatureHeader)) {
      return { valid: false, event: null };
    }
    return { valid: true, event: this.parseBody(rawBody) };
  }

  private signatureMatches(rawBody: string, signatureHeader: string): boolean {
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody, "utf8").digest("hex");
    return constantTimeEquals(expected, signatureHeader);
  }

  private parseBody(rawBody: string): RazorpayWebhookEvent | null {
    try {
      return parseWebhookEvent(JSON.parse(rawBody) as unknown);
    } catch {
      return null;
    }
  }
}

/**
 * `timingSafeEqual` requires equal-length buffers; a length mismatch is
 * resolved as "not equal" up front rather than thrown. Both inputs are fixed
 * -length hex digests / attacker-supplied headers, so the length check
 * itself leaks nothing an attacker doesn't already know (digest length is
 * public).
 */
function constantTimeEquals(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "utf8");
  const received = Buffer.from(receivedHex, "utf8");
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
