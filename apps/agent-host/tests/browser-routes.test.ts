// The sandbox surface as the Bench sees it: what a GET can carry out, what a
// POST can push in, and what the host does when the two are confused. No
// Chrome — the page is a fake, the guards are the real ones.
import { decodePng, REDACTION_RGBA } from "@covenant/browser-drive";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import type { AppEnv } from "../src/http/app-env.js";
import { BROWSER_KEY_HEADER } from "../src/http/browser-key.js";
import { browserApp } from "./support/browser-app.js";
import { StepClock } from "./support/fakes.js";
import {
  FakeSandboxPage,
  PASSWORD,
  PASSWORD_BOX,
} from "./support/fake-sandbox.js";

const KEY = "k".repeat(64);

let page: FakeSandboxPage;
let app: Hono<AppEnv>;

async function post(path: string, body?: unknown): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", [BROWSER_KEY_HEADER]: KEY },
    body: JSON.stringify(body ?? {}),
  });
}

async function read(path: string): Promise<Response> {
  return await app.request(path, { headers: { [BROWSER_KEY_HEADER]: KEY } });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(async () => {
  page = new FakeSandboxPage();
  const clock = new StepClock();
  const rig = browserApp(page, clock, KEY);
  app = rig.app;
  await post("/browser/open", { walk: false });
});

describe("GET /browser/frame", () => {
  /**
   * The polled half of the founder's report. The shutter opens on one page and
   * resolves on the next, and the pixels that come back are the page the
   * window has left — served under the new URL, which is read when the answer
   * is written. "No picture yet" is the honest reply and an ordinary one: the
   * card keeps the last frame up and asks again in half a second.
   */
  it("says no picture rather than one of the page it left", async () => {
    page.underTheShutter = () => {
      page.navigated += 1;
    };
    const body = await json(await read("/browser/frame"));
    expect(body["ok"]).toBe(false);
    expect(body["reason_code"]).toBe("NO_FRAME");
  });

  it("carries a PNG with the password box already painted out", async () => {
    const body = await json(await read("/browser/frame"));
    const frame = body["frame"] as Record<string, unknown>;
    expect(frame["redacted"]).toBe(1);
    const png = String(frame["image"]);
    // Off the single-frame route the shutter always answers, so this is a PNG
    // that was decoded and repainted here — never a passthrough.
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    expect(frame["passthrough"]).toBe(false);
    const image = decodePng(
      new Uint8Array(Buffer.from(png.split(",")[1] ?? "", "base64")),
    );
    const x = Math.round(PASSWORD_BOX.x + PASSWORD_BOX.width / 2);
    const y = Math.round(PASSWORD_BOX.y + PASSWORD_BOX.height / 2);
    const at = (y * image.width + x) * 4;
    expect([...image.pixels.subarray(at, at + 4)]).toEqual([...REDACTION_RGBA]);
  });
});

describe("POST /browser/input while the agent is driving", () => {
  it("is a 409, because sending it at all was the caller's bug", async () => {
    const res = await post("/browser/input", { kind: "scroll", dy: 40 });
    expect(res.status).toBe(409);
    expect((await json(res))["reason_code"]).toBe("NOT_YOUR_TURN");
    expect(page.relayed).toEqual([]);
  });
});

describe("POST /browser/input once the wheel is the user's", () => {
  beforeEach(async () => {
    await post("/browser/takeover");
  });

  it("refuses a credential target and raises the real window", async () => {
    const body = await json(
      await post("/browser/input", { kind: "click", x: 40, y: 50 }),
    );
    expect(body["ok"]).toBe(false);
    expect(body["category"]).toBe("password");
    expect(body["hand_off_natively"]).toBe(true);
    expect(String(body["native_entry"])).toContain(
      "never pass through this page",
    );
    expect(body["fronted"]).toBe(true);
    expect(page.relayed).toEqual(["front"]);
  });

  it("passes an ordinary click through and marks it as the user's", async () => {
    expect(
      (
        await json(
          await post("/browser/input", { kind: "click", x: 300, y: 50 }),
        )
      )["ok"],
    ).toBe(true);
    expect(page.relayed).toEqual(["click 300,50"]);
    const state = await json(await read("/browser/state"));
    const session = state["session"] as { actions: { actor: string }[] };
    expect(session.actions.some((row) => row.actor === "user")).toBe(true);
  });
});

describe("relayed keystrokes once the wheel is the user's", () => {
  beforeEach(async () => {
    await post("/browser/takeover");
  });

  it("refuses a keystroke aimed at a focused password box", async () => {
    page.focused = PASSWORD;
    const body = await json(
      await post("/browser/input", { kind: "type", text: "hunter2" }),
    );
    expect(body["ok"]).toBe(false);
    expect(body["category"]).toBe("password");
    expect(page.relayed).toEqual(["front"]);
  });

  it("refuses a key name that is not on the relay's list", async () => {
    const res = await post("/browser/input", { kind: "key", name: "F12" });
    expect(res.status).toBe(400);
    expect(page.relayed).toEqual([]);
  });
});
