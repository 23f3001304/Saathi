// The host used to guess which of a page's strings was a listing, and carded
// Amazon's own chrome: "Hello, Sign In" at ₹0.00, "Cart 0 item(s) - ₹0.00".
// Now the read is handed over whole, the model names the products, and a row
// becomes a card only where both of its words are verbatim on the page this
// host opened itself and the price is a number above zero.
import {
  WEB_CARD_TOOL,
  WEB_SHOP_TOOLS,
  WEB_TOOL_SERVER,
} from "@covenant/agents";
import type { BatchRead } from "@covenant/browser-drive";
import { EMPTY_PAGE } from "@covenant/browser-drive";
import { beforeEach, describe, expect, it } from "vitest";

import { CardVerbs } from "../src/browser/web-card.js";
import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import type { VerifiedPage } from "../src/browser/web-verify.js";
import { VerifiedReads, VerifyVerbs } from "../src/browser/web-verify.js";
import { cardCall } from "../src/purchase/web-act-calls.js";
import { RESEARCH_TOOL_DECLARATIONS } from "../src/purchase/web-tools.js";

const P1 = "https://shop.example/p1";
const P2 = "https://shop.example/p2";
const PRICE = "₹1,299.00";
const AROUND = { text: PRICE, around: `Navy Kurta ${PRICE} Add to cart` };

function readOf(over: Partial<VerifiedPage> = {}): VerifiedPage {
  return {
    url: P1,
    ok: true,
    sold_out: false,
    title: "Navy Kurta",
    heading: "Navy Kurta",
    declared: null,
    prices: [AROUND],
    text: `Navy Kurta cotton, hand block printed ${PRICE} Add to cart`,
    failure: null,
    ...over,
  };
}

function batchOf(): BatchRead {
  return {
    requested: P1,
    url: P1,
    dom: { ...EMPTY_PAGE, url: P1, title: "Navy Kurta", heading: "Navy Kurta" },
    prices: [AROUND],
    text: `Navy Kurta ${PRICE} Add to cart`,
    soldOut: false,
    failure: null,
  };
}

function carded(body: Readonly<Record<string, unknown>>) {
  return body["carded"] as { ref: string; price_text: string }[];
}

function refusals(body: Readonly<Record<string, unknown>>): string[] {
  return (body["refused"] as { reason: string }[]).map((row) => row.reason);
}

function kurta(over: Partial<{ title: string; price_text: string }> = {}) {
  return { url: P1, title: "Navy Kurta", price_text: PRICE, ...over };
}

let findings: WebFindings;
let reads: VerifiedReads;
let verbs: CardVerbs;

beforeEach(() => {
  findings = new WebFindings();
  reads = new VerifiedReads();
  verbs = new CardVerbs(findings, reads);
  reads.remember([readOf()]);
});

describe("the model names the listing and the host checks the words", () => {
  it("cards a row whose price and title are on the page, refuses the rest", () => {
    const result = verbs.card([
      kurta(),
      kurta({ price_text: "₹999.00" }),
      { url: P2, title: "Anything", price_text: "₹1.00" },
      kurta({ title: "Hello, Sign In", price_text: "₹0.00" }),
    ]);
    expect(carded(result.body)).toHaveLength(1);
    expect(refusals(result.body)).toEqual([
      "price_not_on_page",
      "url_not_verified",
      "price_not_positive",
    ]);
    expect(findings.find(carded(result.body)[0]?.ref ?? "")?.price_paise).toBe(
      129900,
    );
  });

  it("refuses a title the page never printed, at a price it did", () => {
    const result = verbs.card([kurta({ title: "Silk Saree" })]);
    expect(refusals(result.body)).toEqual(["title_not_on_page"]);
  });

  it("does not fail a row over the model's own trailing space", () => {
    const result = verbs.card([
      kurta({ title: " Navy Kurta ", price_text: `${PRICE} ` }),
    ]);
    expect(carded(result.body)[0]?.price_text).toBe(PRICE);
  });
});

describe("what counts as verbatim, and what counts as read", () => {
  it("takes a title the page carries only in its heading", () => {
    reads.remember([readOf({ text: `${PRICE} Add to cart` })]);
    expect(carded(verbs.card([kurta()]).body)).toHaveLength(1);
  });

  it("takes a price the probe listed even where the excerpt ran out", () => {
    reads.remember([readOf({ text: "Navy Kurta, hand block printed" })]);
    expect(carded(verbs.card([kurta()]).body)).toHaveLength(1);
  });

  it("refuses a page that did not load, whatever is named on it", () => {
    reads.remember([readOf({ ok: false, failure: "ERR_ABORTED", text: "" })]);
    expect(refusals(verbs.card([kurta()]).body)).toEqual(["url_not_verified"]);
  });
});

describe("a verify reads and records nothing", () => {
  function verifying(): VerifyVerbs {
    return new VerifyVerbs(
      { readMany: () => Promise.resolve([batchOf()]) },
      reads,
      new WebTrail(),
    );
  }

  it("hands back what the page printed and mints no ref at all", async () => {
    const result = await verifying().verify([P1]);
    const pages = result.body["pages"] as Record<string, unknown>[];
    expect(findings.length).toBe(0);
    expect(pages[0]?.["ref"]).toBeUndefined();
    expect(pages[0]?.["prices"]).toEqual([AROUND]);
    expect(pages[0]?.["heading"]).toBe("Navy Kurta");
    expect(pages[0]?.["text"]).toContain("Add to cart");
  });

  it("remembers the batch, so web_card has a page to check against", async () => {
    await verifying().verify([P1]);
    expect(reads.find(P1)?.title).toBe("Navy Kurta");
    expect(carded(verbs.card([kurta()]).body)).toHaveLength(1);
  });
});

describe("nothing free reaches a card, whoever reported it", () => {
  const zero = { title: "Cart 0 item(s)", priceText: "₹0.00", href: P1 };

  it("drops a listing that costs nothing, and burns no ref on it", () => {
    expect(findings.record([{ ...zero, imageUrl: null }])).toEqual([]);
    const kept = findings.record([
      { title: "Navy Kurta", priceText: PRICE, href: P1, imageUrl: null },
    ]);
    expect(kept[0]?.ref).toBe("w1");
  });

  it("keeps a listing whose price nobody could parse, as it always did", () => {
    const rows = findings.record([
      { title: "Trail 2", priceText: "20% off", href: P1, imageUrl: null },
    ]);
    expect(rows[0]?.price_paise).toBeNull();
  });
});

describe("web_card on the tool surface", () => {
  it("is declared to the errand, moves no money, and is not web_verify's job", () => {
    expect(WEB_SHOP_TOOLS).toContain(WEB_CARD_TOOL);
    const declared = RESEARCH_TOOL_DECLARATIONS.map((tool) => tool.tool);
    expect(declared).toContain(WEB_CARD_TOOL);
    const verify = declared.indexOf("web_verify");
    expect(RESEARCH_TOOL_DECLARATIONS[verify]?.description).toContain(
      "web_card",
    );
    expect(RESEARCH_TOOL_DECLARATIONS[verify]?.description).not.toContain(
      "ref become cards",
    );
  });

  it("routes through the runner's call helpers, refs and all", () => {
    const outcome = cardCall(
      {
        toolUseId: "t1",
        tool: WEB_CARD_TOOL,
        server: WEB_TOOL_SERVER,
        args: { rows: [kurta()] },
      },
      verbs,
    );
    expect(outcome?.isError).toBe(false);
    expect(carded(JSON.parse(outcome?.content ?? "{}"))[0]?.ref).toBe("w1");
  });
});
