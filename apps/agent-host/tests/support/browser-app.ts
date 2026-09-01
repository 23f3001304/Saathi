import { Hono } from "hono";

import { BrowserRegistry } from "../../src/browser/browser-registry.js";
import type { BrowserService } from "../../src/browser/browser-service.js";
import { queueLimitFor } from "../../src/browser/session-capacity.js";
import type { AppEnv } from "../../src/http/app-env.js";
import { registerBrowser } from "../../src/http/browser-routes.js";
import { SessionKeys } from "../../src/http/session-keys.js";
import type { FakeSandboxPage } from "./fake-sandbox.js";
import { fakeSession } from "./fake-sandbox.js";
import { SilentLogger, StepClock } from "./fakes.js";

export interface BrowserApp {
  readonly app: Hono<AppEnv>;
  readonly registry: BrowserRegistry;
  /** The agent's own window: the registry's primary, behind the host key. */
  readonly service: BrowserService;
  readonly keys: SessionKeys;
}

/**
 * The routes over a registry, for tests about one window. The primary is what
 * `/browser/*` reaches, so a test that was written before this host held more
 * than one window still asks exactly the question it always asked.
 */
export function browserApp(
  page: FakeSandboxPage,
  clock: StepClock,
  hostKey: string,
  cap = 4,
): BrowserApp {
  const keys = new SessionKeys();
  const registry = new BrowserRegistry({
    build: () => fakeSession(page, clock),
    ids: { uuid: () => "fake" },
    logger: new SilentLogger(),
    cap,
    queueLimit: queueLimitFor(cap),
    mintKey: (id) => keys.mint(id),
  });
  const app = new Hono<AppEnv>();
  registerBrowser(app, { registry, keys, logger: new SilentLogger(), hostKey });
  return { app, registry, service: registry.primary(), keys };
}
