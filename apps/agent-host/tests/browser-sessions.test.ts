import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import { BrowserRegistry } from "../src/browser/browser-registry.js";
import { queueLimitFor } from "../src/browser/session-capacity.js";
import type { AppEnv } from "../src/http/app-env.js";
import { BROWSER_KEY_HEADER } from "../src/http/browser-key.js";
import { registerBrowser } from "../src/http/browser-routes.js";
import { SessionKeys } from "../src/http/session-keys.js";
import { fakeSession, FakeSandboxPage } from "./support/fake-sandbox.js";
import { SilentLogger, StepClock } from "./support/fakes.js";

const HOST_KEY = "host-key-0123456789abcdef0123456789abcdef";

let app: Hono<AppEnv>;
let keys: SessionKeys;
let registry: BrowserRegistry;
let made = 0;

function build(cap: number) {
  made = 0;
  keys = new SessionKeys();
  registry = new BrowserRegistry({
    build: () => {
      made += 1;
      return Promise.resolve(
        fakeSession(new FakeSandboxPage(), new StepClock(), "container"),
      );
    },
    ids: { uuid: () => `s${made}${Math.random().toString(16).slice(2, 8)}` },
    logger: new SilentLogger(),
    cap,
    queueLimit: queueLimitFor(cap),
    mintKey: (id) => keys.mint(id),
  });
  app = new Hono<AppEnv>();
  registerBrowser(app, {
    registry,
    keys,
    logger: new SilentLogger(),
    hostKey: HOST_KEY,
  });
}

function req(path: string, key: string | null, method = "GET", body?: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (key !== null) headers[BROWSER_KEY_HEADER] = key;
  return app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function openSession(): Promise<{ id: string; key: string }> {
  const res = await req("/browser/sessions", HOST_KEY, "POST", {});
  const body = (await res.json()) as { id: string; key: string };
  return { id: body.id, key: body.key };
}

beforeEach(() => build(3));

/**
 * The reason this whole change had to lead with keys. With one window, a
 * host-wide key and "you own this window" were the same sentence; with
 * several, that key would let any tab that ever shook hands read the frames
 * of, and relay keystrokes into, every other errand on the machine.
 */
describe("a key minted for one window", () => {
  it("does not open another window's routes", async () => {
    const a = await openSession();
    const b = await openSession();
    expect(a.id).not.toBe(b.id);

    const crossed = await req(`/browser/sessions/${b.id}/state`, a.key);
    expect(crossed.status).toBe(403);
    const body = (await crossed.json()) as Record<string, unknown>;
    expect(body["reason_code"]).toBe("NOT_YOUR_SESSION");
    // The refusal says it was a real key aimed at the wrong window, which is
    // a different mistake from having no key at all.
    expect(String(body["human"])).toContain("not for this window");
  });

  it("opens its own window perfectly well", async () => {
    const a = await openSession();
    const own = await req(`/browser/sessions/${a.id}/state`, a.key);
    expect(own.status).toBe(200);
  });

  it("stops working once that window is closed", async () => {
    const a = await openSession();
    expect(
      (await req(`/browser/sessions/${a.id}`, a.key, "DELETE")).status,
    ).toBe(200);
    const after = await req(`/browser/sessions/${a.id}/state`, a.key);
    expect(after.status).toBe(404);
  });
});

describe("that same key aimed at another window's relay", () => {
  it("is refused too, so reads are not the only thing guarded", async () => {
    const a = await openSession();
    const b = await openSession();
    const at = `/browser/sessions/${b.id}/input`;
    const crossed = await req(at, a.key, "POST", { kind: "click", x: 1, y: 1 });
    expect(crossed.status).toBe(403);
  });
});

describe("the host key", () => {
  it("opens a sandbox but reaches none of them", async () => {
    const a = await openSession();
    const reach = await req(`/browser/sessions/${a.id}/state`, HOST_KEY);
    expect(reach.status).toBe(401);
  });

  it("is still what the agent's own window answers to", async () => {
    expect((await req("/browser/state", HOST_KEY)).status).toBe(200);
    expect((await req("/browser/state", "wrong-key")).status).toBe(401);
  });
});

describe("a session id nobody opened", () => {
  it("is a clean 404, whatever key is offered", async () => {
    const a = await openSession();
    const missing = await req("/browser/sessions/web_nothing/state", a.key);
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as Record<string, unknown>;
    expect(body["reason_code"]).toBe("NO_SUCH_SESSION");
  });
});

describe("two windows at once", () => {
  it("are separate sessions with separate state", async () => {
    const a = await openSession();
    const b = await openSession();
    expect(registry.count).toBe(2);
    expect(registry.get(a.id)).not.toBeNull();
    expect(registry.get(b.id)).not.toBeNull();
    expect(registry.get(a.id)?.service).not.toBe(registry.get(b.id)?.service);
  });
});
