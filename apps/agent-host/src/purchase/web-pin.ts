import type { WebListingView } from "../browser/web-listing.js";
import { productKey } from "../browser/listing-identity.js";

/**
 * Where a shop's name reaches its hosts, per market. Host data, and the whole
 * of what "Amazon" means to this process.
 *
 * DECISION: this is not a classifier over the shopper's words. The MODEL
 * decides whether a shop was named and passes the name through in the
 * shopper's own characters; this only turns that declaration into something
 * enforceable, which is what makes the pin the model's own word held to.
 *
 * DECISION: one host per market rather than a list. The storefront that
 * serves a market is the one whose prices need no conversion, and a shop's
 * other hostnames are subdomains of it - which `onShop` takes.
 */
const SHOP_HOSTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  amazon: { INR: "amazon.in" },
  flipkart: { INR: "flipkart.com" },
  myntra: { INR: "myntra.com" },
  croma: { INR: "croma.com" },
  "reliance digital": { INR: "reliancedigital.in" },
};

/**
 * The one product a buy errand is allowed to be about, and the one shop a
 * research errand is allowed to read.
 *
 * DECISION: enforced at the tool, not asked for in the prompt. A live pick of
 * an ADATA XPG failed to open its listing, and the errand then typed into
 * Amazon's search box and opened a *Western Digital* product page — a
 * different manufacturer's drive, inside an errand whose entire subject was
 * the ADATA the shopper had tapped. Told "Amazon", a research errand verified
 * primeabgb and moglix. The prompt said which listing it was about, and which
 * shop. The prompt is not a mechanism.
 *
 * DECISION: search pages stay open. A URL with no product id in it — the
 * shop's own search, a category, the basket — is how an errand recovers from a
 * failed open, and refusing those would leave a broken pick with nowhere to
 * go. What is refused is the specific act the fault consisted of: opening a
 * *different product*.
 *
 * DECISION: one subject at a time. A pick is about a product and a look is
 * about a shop, so `hold` lets a shop go and `toShop` lets a product go; a pin
 * holding both would outlive the errand that meant either.
 */
export class WebPin {
  private held: string | null = null;
  /** As they said it, for the note the errand reads back. */
  private named: string | null = null;
  private host: string | null = null;

  /** The shop the shopper named, resolved. `null` where the name resolves to
   *  no host: an errand nobody can hold to a shop is not pinned, and it is
   *  told so rather than silently bound to a guess. */
  static forShop(named: string, currency: string): WebPin | null {
    const pin = new WebPin();
    pin.toShop(named, currency);
    return pin.host === null ? null : pin;
  }

  get product(): string | null {
    return this.held;
  }

  get pinned(): boolean {
    return this.held !== null;
  }

  /** `null` where the shop puts no id in its URLs: nothing to enforce, and a
   *  pin nobody can check is worse than none. */
  hold(listing: WebListingView): void {
    this.held = productKey(listing.url);
    this.named = null;
    this.host = null;
  }

  /** The look's own aim, one call per errand: the shop they named this turn
   *  takes the place of whatever the last errand was about. */
  toShop(named: string | null, currency: string): void {
    this.held = null;
    const said = (named ?? "").trim();
    this.named = said.length === 0 ? null : said;
    this.host = hostFor(said, currency);
  }

  release(): void {
    this.held = null;
    this.named = null;
    this.host = null;
  }

  /** What the errand should know about its pin: the host it is held to, the
   *  name that resolved to nothing, or `null` where no shop was named. */
  shopNote(): string | null {
    if (this.named === null) return null;
    return this.host ?? `none: could not resolve ${this.named} to a host`;
  }

  /** `null` where this page is the shop they named, or where they named none.
   *  Otherwise the refusal, in the two hosts it is about. */
  offShop(url: string): string | null {
    if (this.host === null || onHost(url, this.host)) return null;
    return `the shopper named ${this.host}; this page is ${hostOf(url) || url.slice(0, 60)}`;
  }

  /** Whether the errand may open this. Unpinned, everything; pinned, the
   *  shop they named, and the product itself or any page that is not one. */
  allows(url: string): boolean {
    if (this.offShop(url) !== null) return false;
    if (this.held === null) return true;
    const asked = productKey(url);
    return asked === null || asked === this.held;
  }
}

/** A name from the table, or a hostname taken as given. A value with a dot in
 *  it is a host the shopper (or the model) typed, and the table has nothing to
 *  add to it; anything else is a name, and an unknown name resolves to
 *  nothing rather than to a guess. */
function hostFor(named: string, currency: string): string | null {
  const said = named.toLowerCase();
  if (said.length === 0) return null;
  if (said.includes(".")) {
    return hostOf(said.includes("//") ? said : `https://${said}`) || null;
  }
  return SHOP_HOSTS[said]?.[currency.toUpperCase()] ?? null;
}

/** The shop, not the page: `m.amazon.in` and `www.amazon.in` are the shop they
 *  named, and so is one over `http`, which is the same page on a worse
 *  transport and not this pin's business. A lookalike host that merely ends in
 *  the same letters is not, hence the dot. */
function onHost(url: string, host: string): boolean {
  const asked = hostOf(url);
  return asked === host || asked.endsWith(`.${host}`);
}

/** `""` for anything that is not a URL with a host, which is on no shop. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "";
  }
}
