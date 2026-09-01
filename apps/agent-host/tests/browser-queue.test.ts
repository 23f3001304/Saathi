// The cap, and the line behind it. A machine that is full is a fact about the
// machine, not a failure of the request, so the answer is a place in a queue.
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
let made = 0;

function build(cap: number): void {
  made = 0;
  keys = new SessionKeys();
  const registry = new BrowserRegistry({
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

function req(path: string, key: string, method = "GET", body?: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json", [BROWSER_KEY_HEADER]: key },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function openSession(): Promise<{ id: string; key: string }> {
  const res = await req("/browser/sessions", HOST_KEY, "POST", {});
  return (await res.json()) as { id: string; key: string };
}

beforeEach(() => build(2));

describe("the cap", () => {
  it("hands out places in line rather than failing the open", async () => {
    build(2);
    await openSession();
    await openSession();
    const third = await req("/browser/sessions", HOST_KEY, "POST", {});
    expect(third.status).toBe(202);
    const body = (await third.json()) as Record<string, unknown>;
    expect(body["kind"]).toBe("queued");
    expect(body["position"]).toBe(1);
    expect(String(body["human"])).toContain("waiting rather than failing");
  });
});

describe("the line behind the cap", () => {
  it("gives a freed slot to the front of the line", async () => {
    build(1);
    const first = await openSession();
    const queued = (await (
      await req("/browser/sessions", HOST_KEY, "POST", {})
    ).json()) as { ticket: string };

    await req(`/browser/sessions/${first.id}`, first.key, "DELETE");
    const claimed = (await (
      await req(`/browser/sessions/queue/${queued.ticket}`, HOST_KEY)
    ).json()) as Record<string, unknown>;
    expect(claimed["kind"]).toBe("open");
    expect(typeof claimed["key"]).toBe("string");
    expect(claimed["key"]).not.toBe(first.key);
  });

  it("turns the request away honestly once the queue is full too", async () => {
    build(1);
    await openSession();
    for (let n = 0; n < queueLimitFor(1); n += 1) {
      await req("/browser/sessions", HOST_KEY, "POST", {});
    }
    const over = await req("/browser/sessions", HOST_KEY, "POST", {});
    expect(over.status).toBe(503);
    const body = (await over.json()) as Record<string, unknown>;
    expect(body["reason_code"]).toBe("AT_CAPACITY");
    expect(String(body["human"])).toContain("Nothing was opened");
  });
});
