import { describe, expect, it } from "vitest";

import { nameFrom, priceFrom, routeIntent } from "../src/assistant/intents.ts";
import { MERCHANT_TOOLS } from "../src/assistant/tools.ts";
import { localTransport } from "../src/assistant/transport.ts";
import { shopContext as context } from "./shopContext.ts";

describe("the tool contract", () => {
  it("has exactly two kinds, and nothing that moves money", () => {
    const kinds = new Set(MERCHANT_TOOLS.map((tool) => tool.kind));
    const names = MERCHANT_TOOLS.map((tool) => tool.name).join(" ");

    expect([...kinds].sort()).toEqual(["propose", "read"]);
    expect(names).not.toMatch(/pay|refund|cancel|mandate|cart|money/);
  });

  it("names a source for every tool, so no figure can be authored", () => {
    expect(MERCHANT_TOOLS.every((tool) => tool.source.length > 0)).toBe(true);
  });
});

describe("routing a shopkeeper's sentence", () => {
  it("sends the shop's own question to the briefing", () => {
    expect(routeIntent("why am I not being picked?")?.tool).toBe(
      "shop.briefing",
    );
  });

  it("sends unmet demand, cool-off and orders to their own folds", () => {
    expect(
      routeIntent("what are people asking for that I don't stock?")?.tool,
    ).toBe("demand.unmet");
    expect(routeIntent("what's waiting on cool-off?")?.tool).toBe(
      "orders.cooloff",
    );
    expect(routeIntent("how are my orders doing?")?.tool).toBe("orders.recent");
  });

  it("reads a price only when the sentence says it is one", () => {
    expect(priceFrom("add a stole at 1899")).toBe(189900);
    expect(priceFrom("add 3 stoles")).toBeNull();
  });

  it("takes the name from the words before the price", () => {
    expect(nameFrom("add a Nilgiri stole at 1899")).toBe("Nilgiri stole");
  });

  it("says what it can do rather than guessing at nonsense", () => {
    expect(routeIntent("qqqq zzz")).toBeNull();
  });
});

describe("what the assistant answers with", () => {
  it("renders the fold as a panel and names what it read", async () => {
    const turn = await localTransport.ask(
      "how is my standing?",
      await context(),
    );

    expect(turn.tool).toBe("shop.standing");
    expect(turn.panel?.kind).toBe("standing");
    expect(turn.did.join(" ")).toContain("how buyers rated you");
  });

  it("says one sentence, never a table written out in words", async () => {
    const turn = await localTransport.ask("show me my orders", await context());

    expect(turn.said.split(". ").length).toBeLessThanOrEqual(2);
    expect(turn.panel?.kind).toBe("orders");
  });

  it("reports cool-off money as committed and not yet money", async () => {
    const turn = await localTransport.ask(
      "what's waiting on cool-off?",
      await context(),
    );

    expect(turn.said).toContain("not yet money");
    expect(turn.panel?.kind).toBe("cooloff");
  });
});

describe("what the assistant proposes", () => {
  it("drafts a listing into the editor and creates nothing", async () => {
    const turn = await localTransport.ask(
      "add a Nilgiri stole at 1899",
      await context(),
    );

    expect(turn.panel?.kind).toBe("editor");
    expect(turn.said).toContain("until you sign it");
  });

  it("asks for a price rather than inventing one", async () => {
    const turn = await localTransport.ask(
      "add a Nilgiri stole",
      await context(),
    );

    expect(turn.panel).toBeNull();
    expect(turn.said).toContain("no price");
  });

  it("drafts a change to the one listing the sentence names", async () => {
    const turn = await localTransport.ask(
      "fix the stole listing",
      await context(),
    );

    expect(turn.panel?.kind).toBe("editor");
  });
});
