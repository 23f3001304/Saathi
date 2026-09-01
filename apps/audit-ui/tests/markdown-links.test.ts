import { describe, expect, it } from "vitest";

import { parseSpans } from "../src/conversation/markdown.ts";

describe("links in agent prose", () => {
  it("parses a labelled http link into a link span", () => {
    const spans = parseSpans(
      "Page: [Amazon SSD search results](https://www.amazon.com/s?k=SSD) read.",
    );
    expect(spans).toEqual([
      { kind: "text", text: "Page: " },
      {
        kind: "link",
        text: "Amazon SSD search results",
        href: "https://www.amazon.com/s?k=SSD",
      },
      { kind: "text", text: " read." },
    ]);
  });

  it("leaves a javascript: url as inert text", () => {
    const spans = parseSpans("[click](javascript:alert(1))");
    expect(spans.every((span) => span.kind === "text")).toBe(true);
  });

  it("leaves a half-streamed link as its literal characters", () => {
    const spans = parseSpans("[Amazon SSD search results](https://www.amazo");
    expect(spans.every((span) => span.kind === "text")).toBe(true);
  });
});

describe("identifiers survive emphasis", () => {
  it("does not read a txn id's underscores as italics", () => {
    const spans = parseSpans(
      "txn_50a77c00-e90c and order_TWgXfRM78BFE3B held.",
    );
    expect(spans).toEqual([
      {
        kind: "text",
        text: "txn_50a77c00-e90c and order_TWgXfRM78BFE3B held.",
      },
    ]);
  });

  it("still honours emphasis at a word edge", () => {
    const spans = parseSpans("that is _important_ here");
    expect(spans.some((span) => span.kind === "em")).toBe(true);
  });
});
