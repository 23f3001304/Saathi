import { pageName } from "../browser/browser-view.js";

/**
 * What the harness says when the errand reached no page at all.
 *
 * The model's own account is dropped in that case rather than shown. An agent
 * that says "here is what I found on Amazon" having opened nothing is the
 * exact failure this path exists to remove, and the only reliable defence is
 * to gate the findings on the record of the navigation.
 */
export const NOTHING_OPENED =
  "I could not get a page open for that, so I have nothing from the web to " +
  "tell you. Nothing above came off a real listing.";

/** The window went somewhere, and the errand ended before it could say what
 *  it found. Naming that beats reporting a page as though it had been read. */
export const CUT_SHORT =
  "That is as far as I got before the page moved under me. Ask me again and " +
  "I will pick it up from there.";

/**
 * The errand ran past its wall clock — see `errand-deadline.ts`.
 *
 * It is said in the harness's voice because at this point the model's is not
 * available: the turn is being closed precisely because nothing more can be
 * awaited from it. What was captured before the clock ran out is real and is
 * still shown, so this is an unfinished answer rather than no answer.
 */
export const RAN_LONG =
  "I ran out of time on that one: the shop stopped answering me partway " +
  "through. What I did read is below. Nothing was bought and nothing was " +
  "signed; ask me again and I will pick it up.";

/** Enough to say where it went; the journal keeps every hop. */
const NAMED = 3;

/**
 * The closing line, written from `WebTrail` rather than from the model's
 * account of its own errand.
 *
 * DECISION: what it promises depends on whether anything was offered. It used
 * to say "those prices are what the page printed… tap one" whatever happened,
 * so a turn that reached a page with no listings on it — a bot check, an
 * interstitial, an empty search — closed by pointing at cards that were not
 * there. A harness sentence that describes a screen the shopper is not looking
 * at is the same failure as an agent naming a page it never opened.
 */
/**
 * DECISION (replacing per-page naming): the shop, not the slug. `pageName`
 * keeps the path, so this line read a product URL's whole
 * `/CRUCIAL-X9-SSD-External-…/dp/…/ref=…` back at the shopper — provenance
 * nobody can read is provenance in name only. The count carries the "how
 * much was looked at"; the hostname carries the "where"; the journal on the
 * window card still holds every full address for whoever wants it.
 */
export function provenance(opened: readonly string[], offered: number): string {
  // Research runs on live web search now, so most errands open no window at
  // all; the sandbox line is kept for the errands that still drive one.
  const where = opened.length === 0 ? "Found by live web search." : read(opened);
  return offered === 0 ? `${where} ${UNSIGNED}` : `${where} ${ON_OFFER}`;
}

function read(opened: readonly string[]): string {
  const shops = [...new Set(opened.map(shopOf))];
  const shown = shops.slice(0, NAMED).join(", ");
  const rest = shops.length > NAMED ? ` and ${shops.length - NAMED} more` : "";
  const pages = opened.length === 1 ? "1 page" : `${opened.length} pages`;
  return `Read ${pages} on ${shown}${rest} in the sandbox window.`;
}

/** The shop a URL belongs to, never its path. */
function shopOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return pageName(url);
  }
}

const UNSIGNED =
  "Whatever it said there is the page's own text, never a signed quote. Off " +
  "this platform the payment step stays yours to take.";

/** No "tap one" here any more. The ask belongs at the composer, which now
 *  carries it ("Pick one and I will go and do that in the window") — saying it
 *  in a transcript line as well put the same instruction on screen twice, one
 *  of them where a shopper cannot act on it. */
const ON_OFFER =
  "Those prices are what the page printed, not signed quotes. Off this " +
  "platform I can find the thing and put it in that shop's own basket, and " +
  "the payment step stays yours to take.";
