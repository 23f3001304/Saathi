import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 over the **raw request body bytes**, keyed by the webhook secret,
 * compared timing-safely against `X-Razorpay-Signature` (§4.8 step 2).
 *
 * The bytes are hashed before any JSON parse: re-serialising a parsed body
 * would change whitespace and key order and the signature would never match —
 * or worse, would match a body different from the one that was signed.
 */
export class RazorpayWebhookVerifier {
  constructor(private readonly webhookSecret: string) {}

  verify(rawBody: string | Uint8Array, signatureHeader: string | null): boolean {
    if (signatureHeader === null) {
      return false;
    }
    const expected = createHmac("sha256", this.webhookSecret)
      .update(
        // Bytes verify as bytes: a decode-and-re-encode is lossless only
        // for valid UTF-8, and the signature is over what was SENT.
        typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody,
      )
      .digest("hex");
    return constantTimeEquals(expected, signatureHeader);
  }
}

/**
 * `timingSafeEqual` requires equal-length buffers, so a length mismatch is
 * resolved up front rather than thrown. Digest length is public, so the early
 * return leaks nothing an attacker does not already know.
 */
function constantTimeEquals(expected: string, received: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(received, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
