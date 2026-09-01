import type { PageDom } from "../read/page-dom.js";

/**
 * Runs *inside the page*, like `page-script.ts`: puppeteer stringifies it, so
 * every helper is declared inline and nothing is imported at runtime. It only
 * reads — no attribute is set, no node is added — because a "reader" that
 * marked the DOM to remember its own refs would be writing to a document the
 * agent is not allowed to write to.
 *
 * eslint max-lines-per-function is waived here for the same reason it is waived
 * in `element-script.ts`: one page read must be one atomic snapshot, and
 * splitting it across `evaluate` round-trips would let the DOM move between the
 * read and the decision made about it.
 */
// eslint-disable-next-line max-lines-per-function
export function readPageDom(): PageDom {
  const MAX_BLOCKS = 60;
  const MAX_LINKS = 40;
  const MAX_CONTROLS = 40;
  const MAX_FRAMES = 20;
  const MAX_TEXT = 300;
  const clean = (value: string | null | undefined): string =>
    (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  const shown = (el: Element): boolean => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const indexOf = (el: Element): number => {
    const kin = Array.from(el.parentElement?.children ?? []).filter(
      (node) => node.tagName === el.tagName,
    );
    return kin.indexOf(el) + 1;
  };
  // A path, not a marker: stable for this document, and computed from what is
  // already there rather than from something we wrote into the page.
  const pathOf = (el: Element): string => {
    const steps: string[] = [];
    let at: Element | null = el;
    while (at !== null && at.tagName !== "BODY" && steps.length < 8) {
      steps.unshift(`${at.tagName.toLowerCase()}:nth-of-type(${indexOf(at)})`);
      at = at.parentElement;
    }
    return `body > ${steps.join(" > ")}`;
  };
  const selectorOf = (el: Element): string => {
    const id = el.getAttribute("id") ?? "";
    if (/^[A-Za-z][\w-]*$/.test(id)) return `#${id}`;
    const name = el.getAttribute("name") ?? "";
    const tag = el.tagName.toLowerCase();
    if (/^[\w-]+$/.test(name)) return `${tag}[name="${name}"]`;
    return pathOf(el);
  };
  const take = <T>(
    nodes: Element[],
    max: number,
    map: (el: Element) => T,
  ): T[] => nodes.filter(shown).slice(0, max).map(map);
  const query = (selector: string): Element[] =>
    Array.from(document.querySelectorAll(selector));
  const blocks = take(
    query("h1,h2,h3,p,li,[data-price],.price,.product-title"),
    MAX_BLOCKS,
    (el) => ({ tag: el.tagName.toLowerCase(), text: clean(el.textContent) }),
  ).filter((block) => block.text !== "");
  const links = take(query("a[href]"), MAX_LINKS, (el) => ({
    text: clean(el.textContent),
    href: (el as HTMLAnchorElement).href,
  })).filter((link) => /^https?:|^file:/.test(link.href));
  const buttons = take(
    query("button,input[type='submit'],input[type='button'],[role='button']"),
    MAX_CONTROLS,
    (el) => ({
      selector: selectorOf(el),
      kind: "button" as const,
      text: clean(el.textContent) || clean(el.getAttribute("value")),
      type: el.getAttribute("type"),
    }),
  );
  const fields = take(
    query("input:not([type='hidden']),textarea,select"),
    MAX_CONTROLS,
    (el) => ({
      selector: selectorOf(el),
      kind: "field" as const,
      text:
        clean(el.getAttribute("aria-label")) ||
        clean(el.getAttribute("placeholder")) ||
        clean(el.getAttribute("name")),
      type: el.getAttribute("type"),
    }),
  );
  // Opaque embeds, by source. Not filtered by `shown`: a challenge widget is
  // often laid out at nothing until it decides to show itself, and where it
  // came from is readable either way.
  const frames = query("iframe,frame,object,embed")
    .slice(0, MAX_FRAMES)
    .map((el) => (el as HTMLIFrameElement).src || el.getAttribute("data") || "")
    .filter((src) => src !== "");
  // Widened after a real-site run: `type=search` is the exception, not the
  // rule. Most shops ship a plain text input named q/s/search, or say so only
  // in a placeholder or an aria-label.
  const searchBox = query(
    "input[type='search']," +
      "input[name='q'],input[name='s'],input[name='k']," +
      "input[name='query'],input[name='search'],input[name='keyword']," +
      "[role='search'] input[type='text'],[role='search'] input:not([type])," +
      "input[placeholder*='earch'],input[aria-label*='earch']",
  ).find(shown);
  return {
    url: location.href,
    title: clean(document.title),
    heading: clean(document.querySelector("h1")?.textContent) || null,
    blocks,
    links,
    controls: [...buttons, ...fields],
    // Filled by the caller from `listing-script.ts`, which reads what the web
    // standardises about a product. Kept out of this pass because nothing is
    // ever aimed at a listing — see that file's second DECISION.
    listings: [],
    frames,
    searchSelector: searchBox === undefined ? null : selectorOf(searchBox),
  };
}
