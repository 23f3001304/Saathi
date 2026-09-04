import type { WebListingView } from "../browser/web-listing.js";
import type { IntentFlow } from "./intent-flow.js";

/** The covenant first: unsigned, the errand obeyed the cart check's own
 *  "no signed rule" and stopped at the basket; signed, the same check has
 *  a ceiling and the checkout proceeds under real bounds. */
export async function covenantFirst(
  intents: IntentFlow | null,
  listing: WebListingView,
): Promise<void> {
  if (intents === null) return;
  await intents.signListing({
    title: listing.title,
    pricePaise: listing.price_paise,
    merchant: merchantOf(listing.url),
  });
}


function merchantOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the shop";
  }
}
