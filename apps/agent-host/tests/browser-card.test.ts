// What the sandbox card says the agent did. The line is read by a person, so
// it names a page; the full URL, tracking payload and all, stays in the journal.
import type { JournalEvent } from "@covenant/browser-drive";
import { describe, expect, it } from "vitest";

import { actionsOf, merchantOf } from "../src/browser/browser-view.js";

/** A real one, from the live session: Google's redirect with its payload. */
const REDIRECT =
  "https://www.google.com/url?" +
  "search%3Fq%3DColum%2Bsports%2Bshoes%2BUK%2B7%26sei%3Dw32Vaq-MKuTj2roPpY3fgQ8" +
  "&q=EhAqCbrBNsAbcAAAAAABDAAqGMT7IdQGIjDBhRzee6RPjyHqr-hMuf37fAmZzwfVYwIPfetq";

function navigatedTo(url: string): JournalEvent {
  return {
    kind: "page.navigated",
    url,
    detail: {},
    seq: 1,
    at: "2026-08-31T00:00:00.000Z",
    session_id: "web_1",
    state: "agent-drive",
    actor: "agent",
  };
}

function labelFor(url: string): string {
  return actionsOf([navigatedTo(url)])[0]?.label ?? "";
}

describe("a line telling a person what the agent did", () => {
  it("names the host and the path, never the query string", () => {
    expect(labelFor("https://www.columbiasportswear.co.in/shop/shoes")).toBe(
      "Opened columbiasportswear.co.in/shop/shoes",
    );
  });

  it("drops a redirect's tracking payload rather than pasting it in", () => {
    const label = labelFor(REDIRECT);
    expect(label).not.toContain("EhAqCbrBNsAbcAAA");
    expect(label).not.toContain("%3D");
    expect(label.length).toBeLessThan(80);
  });

  it("keeps a bare origin short", () => {
    expect(labelFor("https://www.amazon.in/")).toBe("Opened amazon.in");
  });

  it("names the fixture page by its file, not by its absolute path", () => {
    expect(labelFor("file:///c:/covenant/fixtures/shop/cart.html")).toBe(
      "Opened cart.html",
    );
  });
});

describe("whose shop the window is standing in", () => {
  it("reads it off the live URL, so an open-web look is not called a fixture", () => {
    expect(merchantOf("https://www.amazon.in/s?k=ssd")).toBe("amazon.in");
    expect(merchantOf("file:///shop/index.html")).toBe("local fixture shop");
    expect(merchantOf("")).toBe("no page open");
  });
});
