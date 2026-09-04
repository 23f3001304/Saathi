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
// One serialized page function by CDP necessity, exempted like its size.
// eslint-disable-next-line max-lines-per-function, complexity
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
    // Anchored to body ONLY when the walk actually reached it: on a deep
    // element the 8-step cap stops mid-tree, and "body >" then named a
    // child body never had, so the selector found nothing and every click
    // and keystroke at it failed element-not-found.
    const reached = at !== null && at.tagName === "BODY";
    return reached ? `body > ${steps.join(" > ")}` : steps.join(" > ");
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
  // A point is only aimable where the window can actually be clicked: these
  // are viewport coordinates, so a control below the fold reports a y past
  // the window's height and a click there lands on nothing at all. The live
  // failure was exactly that - an add-to-cart at y=805 in a 720-tall window,
  // faithfully aimed at and refused as unreadable. Off-screen controls come
  // back with no point and say so, and the model scrolls first.
  const centreOf = (
    el: Element,
  ): { x: number; y: number; onscreen: boolean } => {
    const box = el.getBoundingClientRect();
    const x = Math.round(box.left + box.width / 2);
    const y = Math.round(box.top + box.height / 2);
    const onscreen =
      x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
    return { x, y, onscreen };
  };
  // Document order spent the whole control budget on a marketplace header
  // before the buy box: 40 slots of nav, pickers and carousel arrows, and
  // the one button the errand exists to press was cut. Buttons whose own
  // text names a shopping action go first; the rest keep document order.
  const ACTION_TEXT =
    /add to (cart|basket|bag)|buy|checkout|proceed|continue|deliver|apply|qty|quantity|order/i;
  const allButtons = query(
    "button,input[type='submit'],input[type='button'],[role='button']",
  ).filter(shown);
  const textOf = (el: Element): string =>
    clean(el.textContent) || clean(el.getAttribute("value"));
  const ranked = [
    ...allButtons.filter((el) => ACTION_TEXT.test(textOf(el))),
    ...allButtons.filter((el) => !ACTION_TEXT.test(textOf(el))),
  ];
  const buttons = ranked.slice(0, MAX_CONTROLS).map((el) => ({
    selector: selectorOf(el),
    kind: "button" as const,
    text: textOf(el),
    type: el.getAttribute("type"),
    at: centreOf(el),
  }));
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
      at: centreOf(el),
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
  // The search box must be IN the control list to be aimable: on a header
  // with more fields than the cap it fell off the end, `search_ref` came
  // back null, and a page with a perfectly good search box refused to be
  // searched. It takes the last slot rather than being dropped.
  const searchEntry =
    searchBox !== undefined &&
    !fields.some((field) => field.selector === selectorOf(searchBox))
      ? [
          {
            selector: selectorOf(searchBox),
            kind: "field" as const,
            text:
              clean(searchBox.getAttribute("aria-label")) ||
              clean(searchBox.getAttribute("placeholder")) ||
              clean(searchBox.getAttribute("name")),
            type: searchBox.getAttribute("type"),
            at: centreOf(searchBox),
          },
        ]
      : [];
  const heldFields =
    searchEntry.length > 0 ? fields.slice(0, MAX_CONTROLS - 1) : fields;
  return {
    url: location.href,
    title: clean(document.title),
    heading: clean(document.querySelector("h1")?.textContent) || null,
    blocks,
    links,
    controls: [...buttons, ...heldFields, ...searchEntry],
    // Filled by the caller from `listing-script.ts`, which reads what the web
    // standardises about a product. Kept out of this pass because nothing is
    // ever aimed at a listing — see that file's second DECISION.
    listings: [],
    frames,
    searchSelector: searchBox === undefined ? null : selectorOf(searchBox),
  };
}
