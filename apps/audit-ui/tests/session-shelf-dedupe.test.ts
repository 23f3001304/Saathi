import { afterEach, describe, expect, it } from "vitest";

import { readChats } from "../src/conversation/sessionStore.ts";

afterEach(() => window.localStorage.clear());

describe("a shelf written by two tabs at once", () => {
  it("re-identifies a duplicated id instead of mounting one chat twice", () => {
    window.localStorage.setItem(
      "covenant-chats",
      JSON.stringify({
        sessions: [
          {
            id: 1,
            title: "kurta",
            group: "Today",
            archived: false,
            conversationId: "cnv_a",
          },
          {
            id: 1,
            title: "ssd",
            group: "Today",
            archived: false,
            conversationId: "cnv_b",
          },
        ],
        groups: ["Today"],
        activeId: 1,
      }),
    );
    const read = readChats();
    expect(read).not.toBeNull();
    const ids = read?.sessions.map((row) => row.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    // Both conversations survive; only the colliding id moved.
    expect(read?.sessions.map((row) => row.conversationId)).toEqual([
      "cnv_a",
      "cnv_b",
    ]);
  });
});
