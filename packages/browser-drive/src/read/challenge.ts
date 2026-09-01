import { CAPTCHA_MARKERS } from "../field/patterns.js";
import type { PageDom } from "./page-dom.js";

/**
 * The hosts that serve human-verification widgets.
 *
 * DECISION: naming these is not the same as naming a shop. A challenge is a
 * third-party widget with a handful of vendors, and which vendor a page
 * embedded is a fact about the widget rather than about the storefront — the
 * list is short, stable, and it works on every shop that buys from any of them.
 * A list of *shops* would be the opposite: long, endless, and wrong the first
 * time somebody opened a store nobody had heard of.
 */
const CHALLENGE_HOSTS: readonly string[] = [
  "google.com/recaptcha",
  "recaptcha.net",
  "hcaptcha.com",
  "challenges.cloudflare.com",
  "arkoselabs.com",
  "funcaptcha.com",
  "geetest.com",
  "perimeterx.net",
  "captcha-delivery.com",
  "datadome.co",
];

export interface ChallengeSighting {
  /** Which of the two structural signals fired. */
  readonly signal: "challenge_widget" | "challenge_text";
  /** What was seen, for the journal and the tool result. Never the content. */
  readonly detail: string;
}

/**
 * Whether the page in front of the agent is asking to check it is human.
 *
 * DECISION: structural, and never by shop. Two signals, both properties of
 * challenges rather than of storefronts: an opaque embed from a verification
 * vendor, and the page saying so in its own words (`CAPTCHA_MARKERS`, the same
 * table `FieldClassifier` refuses a click on).
 *
 * DECISION: this reports, and reports only. Nothing here or downstream of it
 * attempts a challenge — no reading of the widget, no clicking, no solving of
 * any kind. It cannot: the widget is another document, which is why `RelayGate`
 * refuses to aim at one at all. What this turns that dead end into is a
 * handoff, which is the only correct answer to being asked to prove you are a
 * person: hand the question to the person.
 */
export function challengeIn(dom: PageDom): ChallengeSighting | null {
  const widget = dom.frames.find((src) =>
    CHALLENGE_HOSTS.some((host) => src.toLowerCase().includes(host)),
  );
  if (widget !== undefined) {
    return { signal: "challenge_widget", detail: hostOf(widget) };
  }
  const said = CAPTCHA_MARKERS.exec(pageWords(dom));
  return said === null
    ? null
    : { signal: "challenge_text", detail: said[0].trim() };
}

/** The page's own words, and not a listing's: a shop selling a book about
 *  CAPTCHAs is not a shop asking you to solve one. */
function pageWords(dom: PageDom): string {
  const blocks = dom.blocks.map((block) => block.text).join(" ");
  return `${dom.title} ${dom.heading ?? ""} ${blocks}`.toLowerCase();
}

function hostOf(src: string): string {
  try {
    return new URL(src).host;
  } catch {
    return src.slice(0, 80);
  }
}
