import type { MemoryContent, MemoryEntry, SignedQuote } from "@covenant/domain";

/** The predicate a merchant price attestation is filed under (§9.3). */
export const QUOTE_PREDICATE = "price";

function str(content: MemoryContent, key: string): string | null {
  const value = content[key];
  return typeof value === "string" ? value : null;
}

function int(content: MemoryContent, key: string): number | null {
  const value = content[key];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

/**
 * Resolves the P2 signed quote **from memory, by `quote_jti`** — never from
 * the cart body being checked (§8.2). That is the whole point: comparing the
 * cart's total against a number the same cart supplied would verify nothing,
 * so the comparand has to come from a separately attested store record.
 *
 * `null` when no entry carries that `quote_jti`, which `QuoteMatchCheck` reads
 * as `CART_QUOTE_MISMATCH`.
 */
export function resolveSignedQuote(
  entries: readonly MemoryEntry[],
  quoteJti: string,
): SignedQuote | null {
  const entry = entries.find(
    (candidate) => str(candidate.content, "quote_jti") === quoteJti,
  );
  if (entry === undefined) {
    return null;
  }
  const total = int(entry.content, "total_paise");
  const expiry = str(entry.content, "quote_expiry");
  if (total === null || expiry === null) {
    return null;
  }
  return {
    quote_jti: quoteJti,
    sku_id: str(entry.content, "sku_id") ?? entry.subject ?? "",
    total_paise: total,
    asked_unit_paise: int(entry.content, "asked_unit_paise"),
    quote_expiry: expiry,
    reservation_id: str(entry.content, "reservation_id") ?? "",
    signed_by: entry.sourceRef ?? "",
    tier: entry.tier,
  };
}
