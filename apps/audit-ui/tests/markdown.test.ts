// The model writes markdown and the chat printed it verbatim: "- **Kolam Run
// Gc9 road shoe**, UK 8 — **₹1,999 listed price**", asterisks and all.
//
// The obvious fix — setting HTML — is the one thing this surface must not do.
// Merchant prose reaches a bubble after passing through a model, so a renderer
// that can emit a tag is a renderer that can be made to emit one. This parses
// to data instead; nothing downstream touches innerHTML.
import { describe, expect, it } from "vitest";

import { parseMarkdown, parseSpans } from "../src/conversation/markdown.ts";

function kinds(line: string): readonly string[] {
  return parseSpans(line).map((span) => span.kind);
}

function texts(line: string): readonly string[] {
  return parseSpans(line).map((span) => span.text);
}

describe("inline marks", () => {
  it("reads bold without keeping the asterisks", () => {
    expect(kinds("a **navy kurta** please")).toEqual(["text", "strong", "text"]);
    expect(texts("a **navy kurta** please")).toContain("navy kurta");
  });

  it("reads italic and code", () => {
    expect(kinds("*soon* and `code`")).toEqual(["em", "text", "code"]);
  });

  it("leaves an unclosed mark alone, because streaming text arrives half-written", () => {
    expect(kinds("a **navy kur")).toEqual(["text"]);
    expect(texts("a **navy kur")).toEqual(["a **navy kur"]);
  });

  it("does not mistake a lone asterisk for a mark", () => {
    expect(texts("2 * 3 = 6")).toEqual(["2 * 3 = 6"]);
  });
});

describe("blocks", () => {
  it("reads a dash list into items", () => {
    const blocks = parseMarkdown("Found these:\n- One\n- Two");
    expect(blocks.map((b) => b.kind)).toEqual(["para", "bullet", "bullet"]);
  });

  it("reads a numbered list and keeps its markers", () => {
    const blocks = parseMarkdown("1. First\n2. Second");
    expect(blocks.every((b) => b.kind === "step")).toBe(true);
  });

  it("breaks a run-on the model wrote inline as one line", () => {
    const blocks = parseMarkdown("I found one: - Gc9 road shoe - ₹1,999");
    expect(blocks.filter((b) => b.kind === "bullet").length).toBeGreaterThan(0);
  });

  it("leaves ordinary prose as one paragraph", () => {
    const blocks = parseMarkdown("A navy kurta under 2000 rupees, refundable.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("para");
  });

  it("has nothing to say about nothing", () => {
    expect(parseMarkdown("   ")).toEqual([]);
  });
});
