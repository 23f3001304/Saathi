// Job 2: who may reach the sandbox at all. Split from browser-routes.test.ts
// because it is a different question — that file asks what the routes do, this
// one asks whether the caller gets to ask.
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import { BrowserService } from "../src/browser/browser-service.js";
import type { AppEnv } from "../src/http/app-env.js";
import { BROWSER_KEY_HEADER } from "../src/http/browser-key.js";
import { browserApp } from "./support/browser-app.js";
import { StepClock } from "./support/fakes.js";
import { FakeSandboxPage } from "./support/fake-sandbox.js";

const KEY = "k".repeat(64);

let page: FakeSandboxPage;
let app: Hono<AppEnv>;
let service: BrowserService;

async function post(path: string, body?: unknown): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", [BROWSER_KEY_HEADER]: KEY },
    body: JSON.stringify(body ?? {}),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(async () => {
  page = new FakeSandboxPage();
  const clock = new StepClock();
  const rig = browserApp(page, clock, KEY);
  service = rig.service;
  app = rig.app;
  await post("/browser/open", { walk: false });
});

// Job 2. The sandbox routes are the one part of agent-host that reaches a real
// window on the operator's screen, so they are the one part that asks who is
// calling. A refusal here says it was refused; it never looks like a crash.
describe("the sandbox key", () => {
  const bare = async (path: string, method = "GET"): Promise<Response> =>
    await app.request(path, {
      method,
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: "{}" }
        : {}),
    });

  it("refuses every route that reaches or watches the window", async () => {
    for (const path of [
      "/browser/state",
      "/browser/frame",
      "/browser/fields",
    ]) {
      const res = await bare(path);
      expect(res.status).toBe(401);
      expect((await json(res))["reason_code"]).toBe("BROWSER_KEY_REQUIRED");
    }
    for (const path of ["/browser/open", "/browser/input", "/browser/front"]) {
      expect((await bare(path, "POST")).status).toBe(401);
    }
  });

  it("says it was refused, in a sentence the UI can show", async () => {
    const body = await json(await bare("/browser/state"));
    expect(String(body["human"])).toContain("refused");
    expect(String(body["human"])).toContain("minted at boot");
  });
});

describe("what a keyless call did not do", () => {
  const bare = async (path: string, method = "GET"): Promise<Response> =>
    await app.request(path, {
      method,
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: "{}" }
        : {}),
    });

  it("opens nothing and relays nothing when the key is missing", async () => {
    await service.close();
    await bare("/browser/open", "POST");
    expect(service.isOpen).toBe(false);
    expect(page.relayed).toEqual([]);
  });

  it("refuses a key that is merely the wrong key", async () => {
    const res = await app.request("/browser/state", {
      headers: { [BROWSER_KEY_HEADER]: "n".repeat(64) },
    });
    expect(res.status).toBe(401);
  });
});

describe("handing the sandbox key to the UI", () => {
  async function bare(path: string): Promise<Response> {
    return await app.request(path);
  }

  it("hands the key out on the handshake, which is the only ungated route", async () => {
    const body = await json(await bare("/browser/handshake"));
    expect(body["key"]).toBe(KEY);
  });

  it("takes the key from the query string, because EventSource sends no headers", async () => {
    const res = await bare(`/browser/state?key=${KEY}`);
    expect(res.status).toBe(200);
  });
});
