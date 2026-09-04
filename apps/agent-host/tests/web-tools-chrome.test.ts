// The same five tools, against real Chrome and a real DOM. Nothing is faked
// here except the shop being local: the window is a disposable Chrome profile,
// the reader is the script that runs inside the page, and the refusals are the
// classifier's own. This is the end-to-end proof for Job 1.
import type { ToolArgs } from "@covenant/agents";
import {
  GuardedToolDispatcher,
  MoneyToolRegistry,
  PreToolUseHook,
  WEB_TOOL_SERVER,
} from "@covenant/agents";
import { fixtureShopUrl } from "@covenant/browser-drive";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BrowserService } from "../src/browser/browser-service.js";
import { buildFixtureShopSession } from "../src/browser/sandbox-factory.js";
import { HandoverMove } from "../src/browser/web-handover-move.js";
import { WebToolRunner } from "../src/purchase/web-tool-runner.js";
import { chromeSuiteSkip } from "./support/chrome-probe.js";
import { SilentLogger, StepClock } from "./support/fakes.js";
import { webShopperOn, WebOnlyDispatcher } from "./support/web-harness.js";
import { CountingSink, SilentTracer } from "./support/web-doubles.js";

const LAUNCH_MS = 90_000;
// This suite is the *in-process* window's: it drives host `file://` fixtures,
// which a container cannot see. The containerised surface has its own suite in
// packages/browser-drive/tests/container-session.test.ts, against the copy of
// the same shop baked into the image.
process.env["COVENANT_BROWSER_SANDBOX"] = "in-process";

const CEILING = { capPaise: 300_000, currency: "INR" };
/** ₹3,799.00 on the fixture's cart page. */
const CART_PAISE = 379_900;

const SKIP = await chromeSuiteSkip("real-Chrome web-tool suite");

let service: BrowserService;
let guard: GuardedToolDispatcher;
let seq = 0;

async function body(
  tool: string,
  args: ToolArgs = {},
): Promise<Record<string, unknown>> {
  seq += 1;
  const result = await guard.dispatch({
    toolUseId: `t${seq}`,
    tool,
    server: WEB_TOOL_SERVER,
    args,
  });
  return JSON.parse(result.content) as Record<string, unknown>;
}

function refFor(page: Record<string, unknown>, text: string): string {
  const at = page["page"] as { controls: { ref: string; text: string }[] };
  return at.controls.find((c) => c.text === text)?.ref ?? "c999";
}

beforeAll(async () => {
  if (SKIP !== null) return;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const clock = new StepClock();
  const logger = new SilentLogger();
  service = new BrowserService({
    build: (sessionId) =>
      buildFixtureShopSession({ clock, logger, capPaise: 1 }, sessionId),
    ids: { uuid: () => "chrome" },
    logger,
  });
  const shopper = webShopperOn(service);
  const hand = new HandoverMove(() => service.current(), shopper.progress);
  guard = new GuardedToolDispatcher(
    new PreToolUseHook(
      new MoneyToolRegistry(),
      new CountingSink(),
      logger,
      new SilentTracer(),
      { tenantId: "tnt_demo", attackId: null },
    ),
    // One runner for the suite: the ref table a read fills is what the next
    // click resolves against, and a fresh shopper per call would lose it.
    new WebOnlyDispatcher(new WebToolRunner(shopper, hand)),
    null,
  );
}, LAUNCH_MS);

afterAll(async () => {
  await service.close();
}, LAUNCH_MS);

const chrome = describe.skipIf(SKIP !== null);

chrome("shopping a real page through the sandbox", () => {
  it(
    "opens a window on demand and reads the real DOM",
    async () => {
      const opened = await body("web_open", {
        url: fixtureShopUrl("index.html"),
      });
      expect(opened["ok"]).toBe(true);
      const read = await body("web_read");
      const view = read["page"] as {
        text: string[];
        links: { url: string }[];
        search_ref: string | null;
      };
      expect(view.text.join(" ")).toContain("Trailfoot Runner");
      expect(view.links.some((link) => link.url.endsWith("product.html"))).toBe(
        true,
      );
      expect(view.search_ref).not.toBeNull();
      expect(read["provenance"]).toMatchObject({ tier: "P0", signed: false });
    },
    LAUNCH_MS,
  );

  it("clicks a real Add to cart button by the ref it was handed", async () => {
    await body("web_open", { url: fixtureShopUrl("product.html") });
    const read = await body("web_read");
    const added = await body("web_add_to_cart", {
      ref: refFor(read, "Add to cart"),
    });
    expect(added["ok"]).toBe(true);
  });
});

chrome("the real cart, against the signed ceiling", () => {
  it("reads the real cart total and holds it to the signed ceiling", async () => {
    service.bindCeiling(CEILING);
    await body("web_open", { url: fixtureShopUrl("cart.html") });
    const cart = await body("web_cart");
    expect(cart["total_paise_read"]).toBe(CART_PAISE);
    expect(cart["confidence"]).toBe("high");
    expect(cart["outcome"]).toBe("over_cap");
    expect(cart["payment_step_opened"]).toBe(false);
    expect(service.current()?.currentState()).toBe("agent-drive");
  });

  it("opens the final review when the same page is inside the ceiling", async () => {
    service.bindCeiling({ capPaise: 500_000, currency: "INR" });
    const cart = await body("web_cart");
    expect(cart["outcome"]).toBe("within_cap");
    expect(cart["payment_step_opened"]).toBe(true);
    service.current()?.handoff().resume();
  });
});

chrome("the real refusals", () => {
  /**
   * The real checkout fixture asks for a card, and reading it says so while
   * leaving the wheel where it is. Moving it is `web_handover`, which the
   * model calls. The button rule itself is table-tested in
   * `packages/browser-drive/tests/cases-checkout.ts`.
   */
  it("names the real payment page, then hands it over when asked", async () => {
    await body("web_open", { url: fixtureShopUrl("checkout.html") });
    const read = await body("web_read");
    expect(read["ok"]).toBe(true);
    expect(read["looks_like"]).toEqual(["payment"]);
    expect(service.current()?.currentState()).toBe("agent-drive");
    const why = "this page takes the money and that press is yours";
    const handed = await body("web_handover", { reason: "payment", why });
    expect(String(handed["human"])).toContain("yours");
    expect(service.current()?.handoff().current()?.reason).toBe("payment");
    service.current()?.handoff().resume();
  });

  it("refuses to type into a real sign-in page's fields", async () => {
    await body("web_open", { url: fixtureShopUrl("login.html") });
    const typed = await body("web_search", { query: "anything" });
    expect(typed["ok"]).toBe(false);
    expect(String(typed["category"])).toContain("login");
  });
});
