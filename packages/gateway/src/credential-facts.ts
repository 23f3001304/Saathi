import type { Sha256Ref } from "@covenant/domain";
import { isSha256Ref } from "@covenant/domain";

/**
 * Reads two facts out of compact JWSs the trust ring has **already verified**:
 * the credential's `@context` array and the inner merchant authorization's
 * signed `cart_hash`.
 *
 * Decoding a payload is not trusting it. The signature decided authenticity at
 * stage 0; these values then flow into `VerdictContext` as facts, so
 * `UriPinCheck` judges the contexts and `QuoteMatchCheck` compares a third,
 * independently sourced hash rather than the cart's own claim about itself.
 */
function payloadOf(compactJws: string): Record<string, unknown> | null {
  const segment = compactJws.split(".")[1];
  if (segment === undefined) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function readCredentialContexts(
  compactJws: string,
): readonly string[] {
  const vc = payloadOf(compactJws)?.["vc"];
  if (typeof vc !== "object" || vc === null) {
    return [];
  }
  const contexts = (vc as Record<string, unknown>)["@context"];
  return Array.isArray(contexts)
    ? contexts.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function readMerchantAuthCartHash(
  compactJws: string,
): Sha256Ref | null {
  const claim = payloadOf(compactJws)?.["cart_hash"];
  return typeof claim === "string" && isSha256Ref(claim) ? claim : null;
}
