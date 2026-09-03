// Looking further down the page is a move like any other: it goes through the
// same guarded surface, it settles, and it comes back with the window's own
// picture so the model can see what came into view.
import { WEB_SCROLL_TOOL } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { HOME } from "./support/fake-shop.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

let web: WebHarness;

beforeEach(async () => {
  web = webHarness();
  await web.call("web_open", { url: HOME });
});

describe("scrolling the open page", () => {
  it("moves the window and reads the page it is now looking at", async () => {
    const body = await web.body(WEB_SCROLL_TOOL, { dy: 600 });
    expect(body["ok"]).toBe(true);
    expect(body["scrolled"]).toBe(600);
    expect(web.page.scrolled).toEqual([600]);
    expect(body["page"]).toBeDefined();
  });

  it("comes back with the picture the scroll left the window in", async () => {
    const result = await web.call(WEB_SCROLL_TOOL, { dy: -400 });
    expect(result.image?.startsWith("data:image/png;base64,")).toBe(true);
    expect(JSON.parse(result.content)["picture"]).toBe("attached");
  });

  it("refuses a jump the viewport could not make, and presses nothing", async () => {
    const body = await web.body(WEB_SCROLL_TOOL, { dy: 9000 });
    expect(body["failure"]).toBe("bad_arguments");
    expect(web.page.scrolled).toEqual([]);
  });

  it("is refused before a window exists, and says which call to make", async () => {
    const fresh = webHarness();
    const body = await fresh.body(WEB_SCROLL_TOOL, { dy: 100 });
    expect(body["failure"]).toBe("no_window_open");
  });
});
