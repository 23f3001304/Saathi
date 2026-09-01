// @vitest-environment node
//
// The Bench is a separate origin from agent-host, so every sandbox call the
// card makes is a cross-origin one carrying custom headers, and a custom
// header the host does not name in its preflight answer is a call the browser
// never sends at all.
//
// This is the bug it exists to keep out. `X-Covenant-Browser-Session` is added
// the moment the card learns which window it is watching — so the first state
// read succeeded, and every one after it failed the preflight. Four failures
// later the card called the host gone, fell to the fixture reel, and stayed
// there under an OFFLINE banner while the host was answering `/browser/state`
// with `agent-drive` on a real amazon.in URL. Nothing in either app was
// unreachable; the two lists had simply drifted apart, and nothing was
// comparing them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { boot, type LiveHarness } from "./support/liveHarness.ts";
import { SANDBOX_HEADERS } from "../src/browser/browserKey.ts";

let harness: LiveHarness;

beforeAll(async () => {
  harness = await boot();
});

afterAll(async () => {
  await harness.shutdown();
});

describe("the sandbox preflight", () => {
  it("allows every header the card actually sends", async () => {
    const res = await fetch(`${harness.hostUrl}/browser/state`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": SANDBOX_HEADERS.join(", "),
      },
    });

    const allowed = (res.headers.get("access-control-allow-headers") ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase());
    for (const header of SANDBOX_HEADERS) {
      expect(allowed).toContain(header.toLowerCase());
    }
  });
});
