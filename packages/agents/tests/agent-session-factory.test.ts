import { describe, expect, it } from "vitest";

import { createAgentSession } from "../src/providers/agent-session-factory.js";
import type { AgentProviderId } from "../src/providers/provider-config.js";
import {
  AGENT_PROVIDERS,
  hasProviderApiKey,
  PROVIDER_SPECS,
  ProviderConfigError,
  providerModelEnvKey,
  resolveProviderApiKey,
  resolveProviderId,
  resolveProviderModel,
} from "../src/providers/provider-config.js";
import type { Env } from "../src/sdk/model.js";
import { DEFAULT_AGENT_MODEL } from "../src/sdk/model.js";
import { capturingFetch, RecordingDispatcher } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import { hookOf } from "./provider-cases.js";

const KEYS: Readonly<Record<AgentProviderId, Env>> = {
  claude: { ANTHROPIC_API_KEY: "sk-ant-x" },
  openai: { OPENAI_API_KEY: "sk-openai-x" },
  gemini: { GEMINI_API_KEY: "gem-x" },
  sarvam: { SARVAM_API_KEY: "sarvam-x" },
};

function build(env: Env) {
  const { fetch: fetchImpl } = capturingFetch([]);
  return createAgentSession({
    env,
    hook: hookOf(new RecordingSink()),
    dispatcher: new RecordingDispatcher(),
    txnId: "txn_1",
    systemPrompt: "You are the buyer agent.",
    fetchImpl,
  });
}

describe("provider selection", () => {
  it("defaults to claude when COVENANT_AGENT_PROVIDER is unset or empty", () => {
    expect(resolveProviderId({})).toBe("claude");
    expect(resolveProviderId({ COVENANT_AGENT_PROVIDER: "" })).toBe("claude");
  });

  it.each(AGENT_PROVIDERS)("accepts %s", (id) => {
    expect(resolveProviderId({ COVENANT_AGENT_PROVIDER: id })).toBe(id);
  });

  it("rejects an unknown provider by name, listing the valid ones", () => {
    expect(() =>
      resolveProviderId({ COVENANT_AGENT_PROVIDER: "llama" }),
    ).toThrow(ProviderConfigError);
    expect(() =>
      resolveProviderId({ COVENANT_AGENT_PROVIDER: "llama" }),
    ).toThrow(/claude, openai, gemini, sarvam/);
  });
});

describe("model resolution", () => {
  it.each(AGENT_PROVIDERS)(
    "falls back to the verified default for %s",
    (id) => {
      expect(resolveProviderModel({}, id)).toBe(
        PROVIDER_SPECS[id].defaultModel,
      );
    },
  );

  it("keeps claude's existing default untouched", () => {
    expect(resolveProviderModel({}, "claude")).toBe(DEFAULT_AGENT_MODEL);
  });

  it("lets the shared key move every provider", () => {
    const env = { COVENANT_AGENT_MODEL: "shared-model" };
    expect(resolveProviderModel(env, "openai")).toBe("shared-model");
    expect(resolveProviderModel(env, "sarvam")).toBe("shared-model");
  });

  it("lets the per-provider key win over the shared one", () => {
    const env = {
      COVENANT_AGENT_MODEL: "shared-model",
      [providerModelEnvKey("gemini")]: "gemini-pinned",
    };
    expect(resolveProviderModel(env, "gemini")).toBe("gemini-pinned");
    expect(resolveProviderModel(env, "openai")).toBe("shared-model");
  });
});

describe("api key resolution", () => {
  it.each(AGENT_PROVIDERS)("reads the documented variable for %s", (id) => {
    expect(resolveProviderApiKey(KEYS[id], id)).toEqual(expect.any(String));
    expect(hasProviderApiKey(KEYS[id], id)).toBe(true);
    expect(hasProviderApiKey({}, id)).toBe(false);
  });

  it("prefers GOOGLE_API_KEY over GEMINI_API_KEY, as the docs specify", () => {
    const env = { GOOGLE_API_KEY: "google-x", GEMINI_API_KEY: "gemini-x" };
    expect(resolveProviderApiKey(env, "gemini")).toBe("google-x");
  });

  it.each(AGENT_PROVIDERS)("names the missing variable for %s", (id) => {
    const expected = PROVIDER_SPECS[id].apiKeyEnvKeys.join(" or ");
    expect(() => resolveProviderApiKey({}, id)).toThrow(ProviderConfigError);
    expect(() => resolveProviderApiKey({}, id)).toThrow(expected);
  });

  it("carries the variable names on the error, not just in the message", () => {
    try {
      resolveProviderApiKey({}, "sarvam");
      expect.unreachable("expected a ProviderConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderConfigError);
      expect((error as ProviderConfigError).envVars).toEqual([
        "SARVAM_API_KEY",
      ]);
      expect((error as ProviderConfigError).provider).toBe("sarvam");
    }
  });
});

describe("createAgentSession", () => {
  it.each(AGENT_PROVIDERS)("builds a working session for %s", (id) => {
    const created = build({ ...KEYS[id], COVENANT_AGENT_PROVIDER: id });

    expect(created.provider).toBe(id);
    expect(created.model).toBe(PROVIDER_SPECS[id].defaultModel);
    expect(typeof created.session.turn).toBe("function");
  });

  it("gives the non-claude providers a guard and claude the SDK hook", () => {
    for (const id of AGENT_PROVIDERS) {
      const created = build({ ...KEYS[id], COVENANT_AGENT_PROVIDER: id });
      // A guard on every path the SDK's PreToolUse hook does not cover.
      expect(created.guard === null).toBe(id === "claude");
    }
  });

  it.each(AGENT_PROVIDERS)("refuses to build %s without its key", (id) => {
    expect(() => build({ COVENANT_AGENT_PROVIDER: id })).toThrow(
      ProviderConfigError,
    );
  });

  it("lets claude opt out of the key check for a CLI login", () => {
    const { fetch: fetchImpl } = capturingFetch([]);
    const created = createAgentSession({
      env: { COVENANT_AGENT_PROVIDER: "claude" },
      hook: hookOf(new RecordingSink()),
      dispatcher: new RecordingDispatcher(),
      txnId: null,
      systemPrompt: "prompt",
      fetchImpl,
      requireApiKey: false,
    });

    expect(created.provider).toBe("claude");
  });
});
