import { describe, expect, it } from "vitest";

import { localTransport } from "../src/assistant/transport.ts";
import type { Choice, TurnContext } from "../src/assistant/turn.ts";
import { shopContext } from "./shopContext.ts";

async function whichOne(): Promise<{ choice: Choice; context: TurnContext }> {
  const context = await shopContext();
  const turn = await localTransport.ask("fix it", context);
  if (turn.panel?.kind !== "choice") throw new Error("expected a choice");
  return { choice: turn.panel.choice, context };
}

describe("asking the shopkeeper which listing", () => {
  it("offers the listings as options rather than a sentence listing them", async () => {
    const { choice } = await whichOne();

    expect(choice.options.length).toBeGreaterThan(1);
    expect(choice.options[0]?.id).toMatch(/^item_/);
    expect(choice.options[0]?.name.length).toBeGreaterThan(0);
  });

  it("never writes the options out as prose in the sentence", async () => {
    const context = await shopContext();
    const turn = await localTransport.ask("fix it", context);

    expect(turn.said).not.toContain("·");
    expect(turn.said).not.toContain("Navy cotton kurta");
  });

  it("drafts the change for the option that was tapped", async () => {
    const { choice, context } = await whichOne();
    const kurta = choice.options.find((row) => row.name.includes("kurta"));

    const turn = await localTransport.pick(kurta?.id ?? "", choice, context);

    expect(turn.panel?.kind).toBe("editor");
    expect(turn.said).toContain("Navy cotton kurta");
  });
});

describe("answering a choice in words", () => {
  it("takes a listing the sentence names", async () => {
    const { choice, context } = await whichOne();

    const turn = await localTransport.ask("the kurta", {
      ...context,
      pending: choice,
    });

    expect(turn.panel?.kind).toBe("editor");
  });

  it("re-offers the same choice when the answer means nothing to it", async () => {
    const { choice, context } = await whichOne();

    const turn = await localTransport.ask("yes", {
      ...context,
      pending: choice,
    });

    expect(turn.panel).toEqual({ kind: "choice", choice });
    expect(turn.said).toContain("did not follow");
  });
});

describe("what an unrecognised answer must never do", () => {
  it("never falls back to the greeting mid-conversation", async () => {
    const { choice, context } = await whichOne();

    const turn = await localTransport.ask("yes", {
      ...context,
      pending: choice,
    });

    expect(turn.said).not.toContain("I read your shop");
    expect(turn.said).not.toContain("Ask me why buyers pick you");
  });

  it("still lets a different question through", async () => {
    const { choice, context } = await whichOne();

    const turn = await localTransport.ask("what's waiting on cool-off?", {
      ...context,
      pending: choice,
    });

    expect(turn.panel?.kind).toBe("cooloff");
  });
});

describe("what a choice carries with it", () => {
  it("keeps what it already understood when the choice is answered", async () => {
    const context = await shopContext();
    const asked = await localTransport.ask("reprice it at 1500", context);
    if (asked.panel?.kind !== "choice") throw new Error("expected a choice");

    const turn = await localTransport.pick(
      asked.panel.choice.options[0]?.id ?? "",
      asked.panel.choice,
      context,
    );

    expect(turn.panel?.kind).toBe("editor");
    if (turn.panel?.kind !== "editor") return;
    expect(turn.panel.proposal.draft.rupees).toBe("1500.00");
  });
});
