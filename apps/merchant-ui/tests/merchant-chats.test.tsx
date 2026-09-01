import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { enterDesk } from "./enterDesk.tsx";
import { App } from "../src/App.tsx";
import { StreamText } from "../src/conversation/StreamText.tsx";
import { parseMarkdown } from "../src/conversation/markdown.ts";
import { readChats, writeChats } from "../src/conversation/sessionStore.ts";
import { readTurns, writeTurns } from "../src/conversation/turnStore.ts";
import type { Turn } from "../src/assistant/turn.ts";

const CHOICE_TURN: Turn = {
  id: 0,
  asked: "fix it",
  tool: "listing.propose_edit",
  said: "Which one shall I change?",
  did: [],
  panel: {
    kind: "choice",
    choice: {
      tool: "listing.propose_edit",
      args: { amount_paise: "150000" },
      options: [
        {
          id: "item_one",
          name: "Nilgiri handloom stole",
          amountPaise: 189900,
          imageUrl: null,
          active: true,
        },
      ],
    },
  },
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("the shelf of chats", () => {
  it("keeps which chats exist across a reload", () => {
    writeChats({
      sessions: [
        {
          id: 4,
          startedAt: "9:20 am",
          title: "Why am I not being picked?",
          status: "in-progress",
          group: "Chats",
          archived: false,
          conversationId: "conv-4",
        },
      ],
      groups: ["Chats"],
      activeId: 4,
    });

    const held = readChats();

    expect(held?.activeId).toBe(4);
    expect(held?.sessions[0]?.conversationId).toBe("conv-4");
  });

  it("opens a fresh shelf rather than throwing on unreadable storage", () => {
    window.localStorage.setItem("covenant-shop-chats", "{ not json");

    expect(readChats()).toBeNull();
  });
});

describe("a transcript that survives a reload", () => {
  it("brings the turn back with the panel it showed", () => {
    writeTurns("conv-1", [CHOICE_TURN]);

    const [restored] = readTurns("conv-1");

    expect(restored?.asked).toBe("fix it");
    expect(restored?.panel).toEqual(CHOICE_TURN.panel);
  });

  it("drops what does not parse as a turn instead of rendering it", () => {
    window.localStorage.setItem(
      "covenant-shop-chat:conv-2",
      JSON.stringify([{ asked: 7 }, { asked: "ok", said: "fine", panel: 3 }]),
    );

    const turns = readTurns("conv-2");

    expect(turns).toHaveLength(1);
    expect(turns[0]?.panel).toBeNull();
  });

  it("holds no figures of its own — a view panel is only its kind", () => {
    writeTurns("conv-3", [
      { ...CHOICE_TURN, panel: { kind: "briefing" }, said: "One thing." },
    ]);

    expect(readTurns("conv-3")[0]?.panel).toEqual({ kind: "briefing" });
    expect(
      window.localStorage.getItem("covenant-shop-chat:conv-3"),
    ).not.toContain("amountPaise");
  });
});

/** A shelf and a transcript already on this device, as after a reload. */
async function enterWithHistory(): Promise<void> {
  writeChats({
    sessions: [
      {
        id: 1,
        startedAt: "9:20 am",
        title: "Why am I not being picked?",
        status: "in-progress",
        group: "Chats",
        archived: false,
        conversationId: "conv-9",
      },
    ],
    groups: ["Chats"],
    activeId: 1,
  });
  writeTurns("conv-9", [
    {
      id: 0,
      asked: "why am I not being picked?",
      tool: "shop.briefing",
      said: "One thing is costing you sales.",
      did: ["read your ledger"],
      panel: { kind: "briefing" },
    },
  ]);
  window.history.pushState(null, "", "/");
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /Continue as a demo shopkeeper/i }),
  );
  fireEvent.click(await screen.findByText("kolam-run"));
}

describe("the conversation on the shopkeeper's screen", () => {
  it("offers a shelf and a new chat, like the shopper's", async () => {
    await enterDesk();

    expect(
      screen.getByRole("button", { name: "+ New chat" }),
    ).toBeInTheDocument();
  });

  it("comes back to the chat it left, with its panel", async () => {
    await enterWithHistory();
    await screen.findByRole("button", { name: /Why am I not being picked/i });

    expect(document.body.textContent).toContain(
      "One thing is costing you sales.",
    );
    expect(document.body.textContent).toContain("read your ledger");
  });
});

describe("prose the agent writes", () => {
  it("parses the markdown a model emits into blocks, not asterisks", () => {
    const blocks = parseMarkdown("- **Navy kurta** at ₹1,299");

    expect(blocks[0]?.kind).toBe("bullet");
    expect(blocks[0]?.spans[0]?.kind).toBe("strong");
  });

  it("renders bold as an element and never as markup", () => {
    render(<StreamText text="**Navy kurta** <b>not a tag</b>" />);

    expect(document.querySelector("strong")).not.toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(document.body.textContent).toContain("<b>not a tag</b>");
    expect(document.body.textContent).not.toContain("**");
  });
});
