import { describe, expect, it } from "vitest";

import {
  capabilitiesFor,
  CONSERVATIVE_CAPABILITIES,
  lookupCapabilities,
} from "../src/routing/capability-table.js";
import { buildModelCatalog } from "../src/routing/catalog-builder.js";
import { HttpModelDiscovery } from "../src/routing/model-discovery.js";
import { STATIC_MODEL_MANIFEST } from "../src/routing/model-manifest.js";
import { capturingFetch, jsonResponse } from "./doubles.js";
import { RecordingLogger } from "./fakes.js";

const OPENAI_LIST = {
  object: "list",
  data: [
    { id: "gpt-5.6-luna", object: "model" },
    { id: "gpt-5.6-sol", object: "model" },
    { id: "text-embedding-3-large", object: "model" },
    { id: "whisper-1", object: "model" },
  ],
};

function loggerAnd(env: Record<string, string>) {
  return { logger: new RecordingLogger(), env };
}

describe("capability table", () => {
  it("matches the longest family prefix, so a dated snapshot routes today", () => {
    const snapshot = capabilitiesFor("openai", "gpt-5.6-luna-2026-09-01");
    expect(snapshot.costTier).toBe("economy");
    expect(capabilitiesFor("openai", "gpt-5.6-sol").costTier).toBe("premium");
  });

  it("gives an id it has never seen the conservative record", () => {
    expect(lookupCapabilities("openai", "aurora-9")).toBeNull();
    expect(capabilitiesFor("openai", "aurora-9")).toEqual(
      CONSERVATIVE_CAPABILITIES,
    );
    expect(CONSERVATIVE_CAPABILITIES.toolCalling).toBe(false);
    expect(CONSERVATIVE_CAPABILITIES.costTier).toBe("premium");
  });

  it("marks only Sarvam's own families as Indic-trained", () => {
    expect(capabilitiesFor("sarvam", "sarvam-105b").indic).toBe(true);
    expect(capabilitiesFor("openai", "gpt-5.6-luna").indic).toBe(false);
  });
});

describe("catalog building", () => {
  it("keeps discovered chat ids and drops the embeddings and speech ones", async () => {
    const { logger, env } = loggerAnd({ OPENAI_API_KEY: "k" });
    const { fetch: fetchImpl } = capturingFetch([
      jsonResponse(200, OPENAI_LIST),
    ]);
    const catalog = await buildModelCatalog({
      env,
      discovery: new HttpModelDiscovery(fetchImpl),
      logger,
    });
    expect(catalog.map((model) => model.id)).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-sol",
    ]);
    expect(catalog.every((model) => model.source === "discovered")).toBe(true);
  });

  it("falls back to the static manifest when discovery fails", async () => {
    const { logger, env } = loggerAnd({ OPENAI_API_KEY: "k" });
    const { fetch: fetchImpl } = capturingFetch([
      jsonResponse(503, { error: "unavailable" }),
    ]);
    const catalog = await buildModelCatalog({
      env,
      discovery: new HttpModelDiscovery(fetchImpl),
      logger,
    });
    expect(catalog.map((model) => model.id)).toEqual([
      ...STATIC_MODEL_MANIFEST.openai,
    ]);
    expect(catalog.every((model) => model.source === "manifest")).toBe(true);
    expect(
      logger.lines.some((line) => line.evt === "router.discovery.failed"),
    ).toBe(true);
  });
});

describe("keyed providers only", () => {
  it("skips a provider with no key rather than erroring on it", async () => {
    const { logger, env } = loggerAnd({ SARVAM_API_KEY: "k" });
    const { fetch: fetchImpl, calls } = capturingFetch([
      jsonResponse(200, { data: [{ id: "sarvam-105b" }] }),
    ]);
    const catalog = await buildModelCatalog({
      env,
      discovery: new HttpModelDiscovery(fetchImpl),
      logger,
    });
    expect(calls).toHaveLength(1);
    expect(new Set(catalog.map((model) => model.provider))).toEqual(
      new Set(["sarvam"]),
    );
  });

  it("returns an empty catalog, not an error, when nothing is keyed", async () => {
    const { logger, env } = loggerAnd({});
    const { fetch: fetchImpl } = capturingFetch([]);
    await expect(
      buildModelCatalog({
        env,
        discovery: new HttpModelDiscovery(fetchImpl),
        logger,
      }),
    ).resolves.toEqual([]);
  });
});
