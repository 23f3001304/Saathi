import type { KnownAddress } from "./web-address-fill.js";
import type { WebFindings } from "./web-listing.js";

/**
 * What the platform knows, as things the model can go and look at.
 *
 * DECISION: these replace prompt blocks. The delivery profile used to be
 * pasted into every buy errand whether it mattered or not, and the cards on
 * the shopper's screen were described to the model in prose it had to trust.
 * A block in a prompt is this host's account of the world at the moment the
 * prompt was built; a tool is the world when the question is asked, and the
 * model decides when the question is worth asking. Neither of these can
 * write anything: looking is not acting.
 */
export interface SeeParts {
  readonly findings: WebFindings;
  readonly address: KnownAddress | null;
}

/** The cards the shopper is looking at, with the refs that name them. */
export function seeCards(parts: SeeParts): Record<string, unknown> {
  const rows = parts.findings.since(0);
  return {
    ok: true,
    count: rows.length,
    cards: rows.map((row) => ({
      ref: row.ref,
      title: row.title,
      price_text: row.price_text,
      url: row.url,
    })),
  };
}

/**
 * What the shopper has told this app about themselves. Delivery facts only,
 * and only what they stated: nothing here was read off a page, and there is
 * no route from this tool to a password - the vault answers "stored", never
 * "stored, and here it is".
 */
export async function seeProfile(
  parts: SeeParts,
): Promise<Record<string, unknown>> {
  if (parts.address === null) return { ok: true, known: [] };
  const facts = await parts.address.lookup();
  return {
    ok: true,
    known: facts.map((fact) => ({ field: fact.key, value: fact.value })),
    note:
      "web_fill_address types exactly these into a form and nothing else. " +
      "A field missing here is one nobody has told you; ask rather than " +
      "inventing it.",
  };
}
