// Where the product actually lives, and what it looks like.
//
// Covenant is not a marketplace. It does not hold stock, pick, pack or ship
// anything, and there is no fulfilment state anywhere in this app. A listing
// is two things: a **price claim**, which is the Razorpay item, and a
// **pointer**, which is the merchant's own product page — on their site or on
// whichever marketplace they already sell through.
//
// DECISION: the pointer is carried on a labelled last line of the Razorpay
// item description rather than in a field of its own. Razorpay's item schema
// has no URL field, and the alternative — a second store keyed by item id —
// would be a place for the pointer and the item to drift apart. The cost is
// that this is a convention over free text: a merchant who edits the
// description in Razorpay's own dashboard can break the line, and the listing
// then honestly reads as having no product page rather than guessing.
//
// DECISION: a listing's image is a **URL on a second labelled line**, carried
// the same way, and never bytes we hold. The merchant's imagery already lives
// with their product page; storing and serving it here would make Covenant a
// CDN for merchandise it does not sell, and would drag in size limits, content
// moderation and takedown — none of which this product has any business
// answering. The image is a merchant claim, exactly like the price and the
// prose, and it is evidence of nothing.

const PRODUCT_MARKER = "Product page:";

const IMAGE_MARKER = "Product image:";

function lineFor(marker: string): RegExp {
  return new RegExp(`^${marker}\\s*(\\S+)\\s*$`, "im");
}

const PRODUCT_LINE = lineFor(PRODUCT_MARKER);

const IMAGE_LINE = lineFor(IMAGE_MARKER);

export type ListingCopy = {
  /** The description a buyer agent reads and the detector audits. */
  copy: string;
  productUrl: string | null;
  imageUrl: string | null;
};

function parsed(raw: string, schemes: readonly string[]): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    return schemes.includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * http(s) only, parsed rather than pattern-matched. `javascript:` and `data:`
 * URLs are the reason: this value ends up in an anchor a shopkeeper clicks.
 */
export function safeProductUrl(raw: string): string | null {
  return parsed(raw, ["http:", "https:"]);
}

/**
 * One scheme narrower than the product page, on purpose. A product page is a
 * link somebody chooses to click; an image is fetched by a *shopper's*
 * browser without being asked, so `http:` would be blocked as mixed content
 * anyway and would only ever produce a listing whose picture silently never
 * appears.
 */
export function safeImageUrl(raw: string): string | null {
  return parsed(raw, ["https:"]);
}

function valueOn(description: string, line: RegExp): string {
  return line.exec(description)?.[1] ?? "";
}

export function splitCopy(description: string): ListingCopy {
  return {
    copy: description.replace(PRODUCT_LINE, "").replace(IMAGE_LINE, "").trim(),
    productUrl: safeProductUrl(valueOn(description, PRODUCT_LINE)),
    imageUrl: safeImageUrl(valueOn(description, IMAGE_LINE)),
  };
}

function lineOf(marker: string, url: string | null): string {
  return url === null ? "" : `${marker} ${url}`;
}

export function joinCopy(
  copy: string,
  productUrl: string,
  imageUrl: string,
): string {
  const tail = [
    lineOf(PRODUCT_MARKER, safeProductUrl(productUrl)),
    lineOf(IMAGE_MARKER, safeImageUrl(imageUrl)),
  ]
    .filter((line) => line !== "")
    .join("\n");
  const body = copy.trim();
  if (tail === "") return body;
  return body === "" ? tail : `${body}\n\n${tail}`;
}

/** The host, for showing where a listing points without printing the query. */
export function hostOf(productUrl: string): string {
  try {
    return new URL(productUrl).host;
  } catch {
    return productUrl;
  }
}
