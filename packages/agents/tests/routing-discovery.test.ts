import { describe, expect, it } from "vitest";

import { DISCOVERY_ENDPOINTS } from "../src/routing/discovery-endpoints.js";
import {
  CachingModelDiscovery,
  HttpModelDiscovery,
} from "../src/routing/model-discovery.js";
import { capturingFetch, headerOf, jsonResponse } from "./doubles.js";
import { FakeClock } from "./fakes.js";

const OPENAI_LIST = {
  object: "list",
  data: [
    { id: "gpt-5.6-luna", object: "model" },
    { id: "gpt-5.6-sol", object: "model" },
    { id: "text-embedding-3-large", object: "model" },
    { id: "whisper-1", object: "model" },
  ],
};

describe("model discovery", () => {
  it("asks OpenAI for its list with a bearer token and reads data[].id", async () => {
    const { fetch: fetchImpl, calls } = capturingFetch([
      jsonResponse(200, OPENAI_LIST),
    ]);
    const ids = await new HttpModelDiscovery(fetchImpl).discover(
      "openai",
      "sk-test",
    );
    expect(calls[0]?.url).toBe(DISCOVERY_ENDPOINTS.openai.url);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(headerOf(calls[0]!, "authorization")).toBe("Bearer sk-test");
    expect(ids).toContain("gpt-5.6-luna");
  });
});

describe("discovery cache", () => {
  it("serves the second call from cache and refetches after the TTL", async () => {
    const clock = new FakeClock("2026-08-31T00:00:00.000Z");
    const { fetch: fetchImpl, calls } = capturingFetch([
      jsonResponse(200, OPENAI_LIST),
      jsonResponse(200, OPENAI_LIST),
    ]);
    const cached = new CachingModelDiscovery(
      new HttpModelDiscovery(fetchImpl),
      clock,
      { ttlMs: 1_000, failureTtlMs: 500 },
    );
    await cached.discover("openai", "k");
    await cached.discover("openai", "k");
    expect(calls).toHaveLength(1);
    clock.advance(1_500);
    await cached.discover("openai", "k");
    expect(calls).toHaveLength(2);
  });

  it("remembers a failure too, so an outage is not one call per turn", async () => {
    const clock = new FakeClock("2026-08-31T00:00:00.000Z");
    const { fetch: fetchImpl, calls } = capturingFetch([
      jsonResponse(500, { error: "down" }),
    ]);
    const cached = new CachingModelDiscovery(
      new HttpModelDiscovery(fetchImpl),
      clock,
      { ttlMs: 1_000, failureTtlMs: 500 },
    );
    await expect(cached.discover("openai", "k")).rejects.toThrow();
    await expect(cached.discover("openai", "k")).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
