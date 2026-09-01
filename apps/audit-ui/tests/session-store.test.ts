// Chats survived exactly as long as the tab did: reload and the list was gone,
// which reads as the product having lost your work rather than as a fresh
// start. What is kept is only the shelf — the words live in PTLM.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  newConversationId,
  readChats,
  writeChats,
} from "../src/conversation/sessionStore.ts";
import { installMemoryStorage } from "./support/memoryStorage.ts";

const CHATS = {
  sessions: [
    {
      id: 3,
      startedAt: "14:02",
      title: "A navy kurta",
      status: "signed" as const,
      group: "Chats",
      archived: false,
      conversationId: "cnv_kurta",
    },
  ],
  groups: ["Chats", "Gifts"],
  activeId: 3,
};

describe("keeping the chat shelf across a reload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads back what it wrote", () => {
    installMemoryStorage();
    writeChats(CHATS);
    expect(readChats()).toEqual(CHATS);
  });

  it("starts fresh when there is nothing stored", () => {
    installMemoryStorage();
    expect(readChats()).toBeNull();
  });
});

describe("storage it cannot read", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts fresh rather than throwing on unreadable storage", () => {
    installMemoryStorage();
    window.localStorage.setItem("covenant-chats", "{not json");
    expect(() => readChats()).not.toThrow();
  });
});

// The transcript is not kept here and must not be: the words live in PTLM,
// where they are tiered and bound into the digest the Cart Mandate signs. What
// the shelf carries is the id you fetch them back with.
describe("the id the transcript is fetched back with", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the conversation id across a reload", () => {
    installMemoryStorage();
    writeChats(CHATS);
    expect(readChats()?.sessions[0]?.conversationId).toBe("cnv_kurta");
  });

  it("reads a chat shelved before ids existed as one with no history", () => {
    installMemoryStorage();
    window.localStorage.setItem(
      "covenant-chats",
      JSON.stringify({
        sessions: [
          {
            id: 3,
            startedAt: "14:02",
            title: "A navy kurta",
            status: "signed",
            group: "Chats",
            archived: false,
          },
        ],
        groups: ["Chats"],
        activeId: 3,
      }),
    );
    const read = readChats();
    expect(read?.sessions).toHaveLength(1);
    expect(read?.sessions[0]?.conversationId).toBeNull();
  });
});

describe("what the shelf is allowed to hold", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mints an id per chat rather than one per page", () => {
    expect(newConversationId()).not.toBe(newConversationId());
  });

  it("stores the shelf and never the words", () => {
    installMemoryStorage();
    writeChats(CHATS);
    const raw = window.localStorage.getItem("covenant-chats") ?? "";
    expect(raw).not.toContain("said_at");
    expect(raw).not.toContain("speaker");
  });
});

describe("storage that will not cooperate", () => {
  it("survives a profile that throws on touching storage at all", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("hardened");
        },
        setItem: () => {
          throw new Error("hardened");
        },
      },
    });
    expect(readChats()).toBeNull();
    expect(() => writeChats(CHATS)).not.toThrow();
  });

  it("drops rows that are not chats rather than trusting the blob", () => {
    installMemoryStorage();
    window.localStorage.setItem(
      "covenant-chats",
      JSON.stringify({ sessions: [{ id: "three" }], groups: [] }),
    );
    expect(readChats()).toBeNull();
  });
});
