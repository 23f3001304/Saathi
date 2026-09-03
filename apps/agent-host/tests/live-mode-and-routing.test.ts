import type { RoutingDecision } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import type { Env } from "../src/config.js";
import {
  keyedProviders,
  LIVE_PROVIDER_KEYS,
  loadConfig,
} from "../src/config.js";
import { RouterJournal } from "../src/obs/router-journal.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";

const BASE: Env = {
  COVENANT_GATEWAY_URL: "http://localhost:8787",
  COVENANT_KEY_DIR: "./keys",
};

function live(extra: Env = {}): Env {
  return { ...BASE, COVENANT_AGENT_MODE: "live", ...extra };
}

describe("live mode needs one provider key, not a particular one", () => {
  it("starts on an OpenAI key alone", () => {
    expect(loadConfig(live({ OPENAI_API_KEY: "sk-x" })).mode).toBe("live");
  });

  it("starts on a Sarvam key alone", () => {
    expect(loadConfig(live({ SARVAM_API_KEY: "sk-y" })).mode).toBe("live");
  });

  it("refuses with no key at all, naming every key it looked for", () => {
    expect(() => loadConfig(live())).toThrow(/at least one provider API key/);
    for (const key of LIVE_PROVIDER_KEYS) {
      expect(() => loadConfig(live())).toThrow(new RegExp(key));
    }
  });

  it("treats an empty string as absent, the way docker compose sets it", () => {
    expect(() => loadConfig(live({ OPENAI_API_KEY: "" }))).toThrow(
      /at least one provider API key/,
    );
  });

  it("keeps scripted as the default, needing nothing at all", () => {
    expect(loadConfig(BASE).mode).toBe("scripted");
    expect(keyedProviders(BASE)).toEqual([]);
  });

  it("reports only the providers that are actually keyed", () => {
    expect(
      keyedProviders({ OPENAI_API_KEY: "a", SARVAM_API_KEY: "b" }),
    ).toEqual(["openai", "sarvam"]);
  });
});

function decisionOf(chosen: string): RoutingDecision {
  return {
    taskClass: "retrieval",
    features: {
      promptChars: 12,
      toolDepth: 1,
      structuredOutput: false,
      touchesMoney: false,
      script: "latin",
    },
    candidates: ["openai:gpt-5.6-luna", chosen],
    chosen,
    attempts: [
      {
        provider: "openai",
        model: "gpt-5.6-luna",
        source: "discovered",
        confidence: 0.31,
        components: [{ name: "languageCertainty", weight: 0.2, value: 0.31 }],
        accepted: false,
        escalatedBecause:
          "confidence 0.31 < 0.62, weakest signal languageCertainty",
      },
      {
        provider: "openai",
        model: chosen.split(":")[1] ?? "",
        source: "discovered",
        confidence: 0.9,
        components: [{ name: "languageCertainty", weight: 0.2, value: 0.9 }],
        accepted: true,
        escalatedBecause: null,
      },
    ],
    escalations: 1,
    capped: false,
    threshold: 0.62,
  };
}

function journal() {
  const logger = new RecordingLogger();
  return {
    logger,
    journal: new RouterJournal(new StepClock(), new SeqIds(), logger),
  };
}

describe("router journal", () => {
  it("hash-chains routing decisions the way the F2 journal chains blocks", () => {
    const { journal: routing } = journal();
    routing.record(decisionOf("openai:gpt-5.6-terra"));
    routing.record(decisionOf("openai:gpt-5.6-sol"));
    const entries = routing.all();
    expect(entries.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(entries[0]?.prev_hash).toBe("0".repeat(64));
    expect(entries[1]?.prev_hash).toBe(entries[0]?.this_hash);
    expect(entries[0]?.this_hash).not.toBe(entries[1]?.this_hash);
  });

  it("keeps the whole decision, not a summary of it", () => {
    const { journal: routing } = journal();
    routing.record(decisionOf("openai:gpt-5.6-terra"));
    const stored = routing.all()[0]?.decision;
    expect(stored?.candidates).toHaveLength(2);
    expect(stored?.attempts[0]?.escalatedBecause).toMatch(/weakest signal/);
    expect(stored?.attempts[0]?.components[0]?.weight).toBe(0.2);
  });

  it("logs each decision at info, so an escalation is findable after the fact", () => {
    const { journal: routing, logger } = journal();
    routing.record(decisionOf("openai:gpt-5.6-terra"));
    const line = logger.lines.find((entry) => entry.evt === "router.decision");
    expect(line?.level).toBe("info");
    expect(line?.fields["chosen"]).toBe("openai:gpt-5.6-terra");
    expect(line?.fields["escalations"]).toBe(1);
    expect(line?.fields["confidence"]).toBe(0.9);
  });
});
