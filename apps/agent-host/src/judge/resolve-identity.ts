import type { CatalogSku } from "@covenant/agents";

/**
 * Identity is a fact the host holds, not something a model may propose.
 *
 * The draft schema asks for `merchants` and `skus`, so the model supplied
 * plausible-looking strings — the shop's display name, a product title — and
 * every cart then failed against the merchant's actual issuer URN and the
 * catalog's actual SKU ids. `MERCHANT_NOT_ALLOWED`, then `SKU_NOT_ALLOWED`, on
 * a purchase that was in every other respect exactly what the shopper asked
 * for.
 *
 * Worse than broken. A model that can name a merchant can name one the shopper
 * never meant, and a bound naming something that does not exist is not a bound
 * at all. So the split is: the model decides *what to buy and how much to
 * spend*; the host decides *who sells it and what it is called*. The model's
 * choice is honoured — it is resolved, not overruled — and a choice that
 * resolves to nothing real is refused rather than signed.
 */
export interface Identity {
  readonly merchantIss: string;
  readonly catalog: readonly CatalogSku[];
}

export class UnresolvableDraft extends Error {}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** A proposal matches a listing by its id, or by the label a human would use. */
function skuFor(
  proposed: string,
  catalog: readonly CatalogSku[],
): string | null {
  const wanted = normalise(proposed);
  if (wanted === "") return null;
  const byId = catalog.find((item) => normalise(item.sku) === wanted);
  if (byId !== undefined) return byId.sku;
  const byLabel = catalog.find((item) => normalise(item.label) === wanted);
  return byLabel?.sku ?? null;
}

function proposedSkus(draft: Record<string, unknown>): readonly string[] {
  const value = draft["skus"];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function resolvedSkus(
  draft: Record<string, unknown>,
  catalog: readonly CatalogSku[],
): readonly string[] {
  const found = proposedSkus(draft)
    .map((proposed) => skuFor(proposed, catalog))
    .filter((sku): sku is string => sku !== null);
  return [...new Set(found)];
}

/**
 * Returns the draft with its identifiers made real. Throws when the model named
 * nothing this catalog sells — the deterministic drafter then picks a listing
 * that exists, which is the floor the live path is allowed to fall back to.
 */
export function resolveIdentity(draft: unknown, identity: Identity): unknown {
  if (typeof draft !== "object" || draft === null) return draft;
  const fields = draft as Record<string, unknown>;
  const skus = resolvedSkus(fields, identity.catalog);
  if (skus.length === 0) {
    throw new UnresolvableDraft(
      "the draft named no product this catalog sells",
    );
  }
  return { ...fields, merchants: [identity.merchantIss], skus };
}
