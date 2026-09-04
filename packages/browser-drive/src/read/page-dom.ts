/**
 * What a page says about itself, harvested and nothing more. Every string here
 * came off a document nobody in this system signed, so the shape carries no
 * numbers, no money type and no verdict — parsing and trusting are separate
 * jobs, and this is neither (mirrors `CartDom`).
 */
export interface PageBlock {
  readonly tag: string;
  readonly text: string;
}

export interface PageLink {
  readonly text: string;
  /** Absolute, resolved by the document itself rather than by us. */
  readonly href: string;
}

export type PageControlKind = "button" | "field";

/** One thing on the page an action could aim at, with the selector to aim by. */
export interface PageControlDom {
  readonly selector: string;
  readonly kind: PageControlKind;
  readonly text: string;
  readonly type: string | null;
  /** Centre of the control's box in viewport pixels — the same space the
   *  hit-test and the pointer use, so an aim taken from a read lands on the
   *  thing that was read. Absent when the reader did not measure. */
  /** Viewport point, and whether it is inside the window right now. A
   *  control below the fold cannot be clicked where it says it is: scroll
   *  to it first. */
  readonly at?: {
    readonly x: number;
    readonly y: number;
    readonly onscreen: boolean;
  };
}

/**
 * One product tile as the page presented it: what it was called, the price it
 * printed, where the tile links, and the picture it showed.
 *
 * Strings, like everything else here. `priceText` is the page's own characters
 * and not a number, because parsing and trusting are separate jobs and this is
 * neither — a tile that says "₹4,756.10" is making a claim, and turning it into
 * an integer here would be the first place that claim looked like a fact.
 *
 * `imageUrl` is `https:` or nothing. It is fetched by a shopper's browser
 * without being asked, so `http:` would be blocked as mixed content and a
 * `data:` URI would put the whole picture into a tool result and a beat log.
 */
export interface PageListing {
  readonly title: string;
  readonly priceText: string;
  /** Absolute, resolved by the document itself rather than by us. */
  readonly href: string;
  readonly imageUrl: string | null;
}

export interface PageDom {
  readonly url: string;
  readonly title: string;
  readonly heading: string | null;
  readonly blocks: readonly PageBlock[];
  readonly links: readonly PageLink[];
  readonly controls: readonly PageControlDom[];
  /** Product tiles the reader recognised — a search result page's own rows. */
  readonly listings: readonly PageListing[];
  /**
   * Where the page's opaque embeds come from — iframe, frame, object, embed.
   * Sources only: what is *inside* one is another document this process cannot
   * read, which is exactly why `RelayGate` refuses to aim at one. Reading where
   * they came from is how the harness recognises a human-verification widget
   * without ever touching it (`read/challenge.ts`).
   */
  readonly frames: readonly string[];
  /** The page's own search box, when it has one the reader could recognise. */
  readonly searchSelector: string | null;
}

export const EMPTY_PAGE: PageDom = {
  url: "",
  title: "",
  heading: null,
  blocks: [],
  links: [],
  controls: [],
  listings: [],
  frames: [],
  searchSelector: null,
};
