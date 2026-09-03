import { describe, expect, it } from "vitest";

import { createAgentSession } from "../src/providers/agent-session-factory.js";
import type {
  AgentProviderId,
  Env,
} from "../src/providers/provider-config.js";
import {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_PROVIDER,
  hasProviderApiKey,
  PROVIDER_SPECS,
  ProviderConfigError,
  providerModelEnvKey,
  resolveProviderApiKey,
  resolveProviderId,
  resolveProviderModel,
} from "../src/providers/provider-config.js";
import { capturingFetch, RecordingDispatcher } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import { hookOf } from "./provider-cases.js";

/** One key per provider, read off its spec so this file cannot drift. */
function keyFor(id: AgentProviderId): Env {
  const [name] = PROVIDER_SPECS[id].apiKeyEnvKeys;
  return name === undefined ? {} : { [name]: `${id}-key` };
}

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
  it("defaults to openai when COVENANT_AGENT_PROVIDER is unset or empty", () => {
    expect(DEFAULT_AGENT_PROVIDER).toBe("openai");
    expect(resolveProviderId({})).toBe("openai");
    expect(resolveProviderId({ COVENANT_AGENT_PROVIDER: "" })).toBe("openai");
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
    ).toThrow(new RegExp(AGENT_PROVIDERS.join(", ")));
  });

  it.each(["claude", "gemini"])("no longer knows %s", (id) => {
    expect(() => resolveProviderId({ COVENANT_AGENT_PROVIDER: id })).toThrow(
      ProviderConfigError,
    );
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

  it("makes the OpenAI default the package default", () => {
    expect(resolveProviderModel({}, "openai")).toBe(DEFAULT_AGENT_MODEL);
  });

  it("lets the shared key move a provider, and the per-provider key win", () => {
    const shared = { COVENANT_AGENT_MODEL: "shared-model" };
    expect(resolveProviderModel(shared, "openai")).toBe("shared-model");
    const pinned = {
      ...shared,
      [providerModelEnvKey("openai")]: "openai-pinned",
    };
    expect(resolveProviderModel(pinned, "openai")).toBe("openai-pinned");
  });
});

describe("api key resolution", () => {
  it.each(AGENT_PROVIDERS)("reads the documented variable for %s", (id) => {
    expect(resolveProviderApiKey(keyFor(id), id)).toBe(`${id}-key`);
    expect(hasProviderApiKey(keyFor(id), id)).toBe(true);
    expect(hasProviderApiKey({}, id)).toBe(false);
  });

  it.each(AGENT_PROVIDERS)("names the missing variable for %s", (id) => {
    const expected = PROVIDER_SPECS[id].apiKeyEnvKeys.join(" or ");
    expect(() => resolveProviderApiKey({}, id)).toThrow(ProviderConfigError);
    expect(() => resolveProviderApiKey({}, id)).toThrow(expected);
  });

  it("carries the variable names on the error, not just in the message", () => {
    try {
      resolveProviderApiKey({}, "openai");
      expect.unreachable("expected a ProviderConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderConfigError);
      expect((error as ProviderConfigError).envVars).toEqual([
        "OPENAI_API_KEY",
      ]);
      expect((error as ProviderConfigError).provider).toBe("openai");
    }
  });
});

describe("createAgentSession", () => {
  it.each(AGENT_PROVIDERS)("builds a working session for %s", (id) => {
    const created = build({ ...keyFor(id), COVENANT_AGENT_PROVIDER: id });

    expect(created.provider).toBe(id);
    expect(created.model).toBe(PROVIDER_SPECS[id].defaultModel);
    expect(typeof created.session.turn).toBe("function");
  });

  it.each(AGENT_PROVIDERS)(
    "puts the F2 gate on %s: there is no path without one",
    (id) => {
      const created = build({ ...keyFor(id), COVENANT_AGENT_PROVIDER: id });

      expect(created.guard.blocked).toEqual([]);
      expect(created.guard.seen).toEqual([]);
    },
  );

  it.each(AGENT_PROVIDERS)("refuses to build %s without its key", (id) => {
    expect(() => build({ COVENANT_AGENT_PROVIDER: id })).toThrow(
      ProviderConfigError,
    );
  });
});
