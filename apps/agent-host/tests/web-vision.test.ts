// Vision, as a property of the tool surface rather than of one call. After
// every move that touched the window the model is handed the window, so its
// next move is decided from what is on the screen now. Everything below goes
// through the real hook, the real guarded dispatcher and the real runner.
import {
  WEB_ADD_TO_CART_TOOL,
  WEB_CART_TOOL,
  WEB_ENTER_CODE_TOOL,
  WEB_FILL_ADDRESS_TOOL,
  WEB_GLANCE_TOOL,
  WEB_HANDOVER_TOOL,
  WEB_OPEN_TOOL,
  WEB_PRESS_TOOL,
  WEB_READ_TOOL,
  WEB_SCROLL_TOOL,
  WEB_SEARCH_TOOL,
  WEB_SIGN_IN_TOOL,
  WEB_WRITE_TOOL,
} from "@covenant/agents";
import type { ToolArgs } from "@covenant/agents";
import type { Capture } from "@covenant/browser-drive";
import { beforeEach, describe, expect, it } from "vitest";

import { HOME, PRODUCT } from "./support/fake-shop.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

let web: WebHarness;

const MOVES: Readonly<Record<string, ToolArgs>> = {
  [WEB_OPEN_TOOL]: { url: PRODUCT },
  [WEB_READ_TOOL]: {},
  [WEB_PRESS_TOOL]: { x: 40, y: 60 },
  [WEB_WRITE_TOOL]: { x: 40, y: 60, text: "2" },
  [WEB_SCROLL_TOOL]: { dy: 400 },
  [WEB_ADD_TO_CART_TOOL]: { ref: "c1" },
  [WEB_FILL_ADDRESS_TOOL]: {},
  [WEB_SIGN_IN_TOOL]: {},
  [WEB_ENTER_CODE_TOOL]: { code: "123456" },
  [WEB_GLANCE_TOOL]: {},
};

const BLACKOUT: Capture = {
  kind: "blackout",
  blackout: {
    category: "password",
    rule: "protected_focus",
    human: "A protected field has focus.",
  },
};

/**
 * The shutter, closed by hand. Nothing in the shipped capture path returns a
 * blackout today (see `FrameCapture`'s own DECISION, which reversed it), so
 * the seam every picture still has to obey is driven here directly rather than
 * through a fake password box that could not reach it.
 */
function closeShutter(harness: WebHarness): void {
  const session = harness.service.current();
  if (session !== null) {
    session.screenshot = () => Promise.resolve(BLACKOUT);
  }
}

beforeEach(async () => {
  web = webHarness();
  await web.call("web_open", { url: HOME });
});

describe("what the errand sees after it moves", () => {
  it("hands back the picture the move left the window in, every time", async () => {
    for (const [tool, args] of Object.entries(MOVES)) {
      const result = await web.call(tool, args);
      expect(result.image?.startsWith("data:image/png;base64,")).toBe(true);
      expect(JSON.parse(result.content)["picture"]).toBe("attached");
    }
  });

  // A refused move gets one too: that is exactly when the model most needs to
  // see where it is standing. Both of these are refusals in this harness.
  it("pictures a refused move as well as one that landed", async () => {
    const pressed = await web.call(WEB_PRESS_TOOL, { x: 40, y: 60 });
    const carted = await web.call(WEB_ADD_TO_CART_TOOL, { ref: "c99" });
    for (const refused of [pressed, carted]) {
      expect(refused.isError).toBe(true);
      expect(JSON.parse(refused.content)["picture"]).toBe("attached");
      expect(refused.image).toBeDefined();
    }
  });

  it("withholds it while a protected field has focus, and names the reason", async () => {
    closeShutter(web);
    for (const [tool, args] of Object.entries(MOVES)) {
      const result = await web.call(tool, args);
      expect(result.image).toBeUndefined();
      expect(String(JSON.parse(result.content)["picture"])).toBe(
        "withheld: a protected field has focus",
      );
    }
  });
});

/**
 * The one call whose entire answer is the picture. When none may leave there
 * is nothing left of it, so it has to fail rather than report a success with
 * an image it did not send: a body that says a screenshot follows, when one
 * does not, is the model deciding its next move off the last one it saw.
 */
describe("a glance with no picture in it", () => {
  it("fails plainly under the shutter and names the reason", async () => {
    closeShutter(web);
    const result = await web.call(WEB_GLANCE_TOOL, {});
    const body = JSON.parse(result.content) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(body["ok"]).toBe(false);
    expect(body["failure"]).toBe("no_picture");
    expect(body["picture"]).toBe("withheld: a protected field has focus");
    expect(result.image).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("screenshot follows");
  });

  it("fails the same way once the window is the shopper's", async () => {
    await web.call(WEB_HANDOVER_TOOL, {
      reason: "payment",
      why: "The card form is up.",
    });
    const result = await web.call(WEB_GLANCE_TOOL, {});
    const body = JSON.parse(result.content) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(body["failure"]).toBe("no_picture");
    expect(String(body["picture"])).toMatch(/^withheld/);
    expect(result.image).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("screenshot follows");
  });
});

// The moves that are not at the window get nothing: a search is answered by
// the reading it causes, a cart check is a read, and handing the wheel over is
// the one move whose whole point is that the window stops being the agent's.
describe("the moves that are not at the window", () => {
  it("sends no picture back at all", async () => {
    const away: Readonly<Record<string, ToolArgs>> = {
      [WEB_SEARCH_TOOL]: { query: "red runners" },
      [WEB_CART_TOOL]: {},
      [WEB_HANDOVER_TOOL]: { reason: "payment", why: "The card form is up." },
    };
    for (const [tool, args] of Object.entries(away)) {
      const result = await web.call(tool, args);
      expect(result.image).toBeUndefined();
      expect(JSON.parse(result.content)["picture"]).toBeUndefined();
    }
  });

  // The wheel moved with the handover, so the capture path has stopped
  // redacting: a picture taken now would be of the shopper's own screen.
  it("stops picturing the window once it is the shopper's", async () => {
    await web.call(WEB_HANDOVER_TOOL, {
      reason: "payment",
      why: "The card form is up.",
    });
    const result = await web.call(WEB_READ_TOOL, {});
    expect(result.image).toBeUndefined();
    expect(String(JSON.parse(result.content)["picture"])).toMatch(/^withheld/);
  });
});
