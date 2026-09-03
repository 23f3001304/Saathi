import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createAgentSession } from "../src/providers/agent-session-factory.js";
import type {
  AgentProviderId,
  Env,
} from "../src/providers/provider-config.js";
import {
  AGENT_PROVIDERS,
  hasProviderApiKey,
  PROVIDER_SPECS,
  resolveProviderModel,
} from "../src/providers/provider-config.js";
import { RecordingDispatcher } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import { hookOf } from "./provider-cases.js";

/**
 * Reads `covenant/.env` (git-ignored, never committed) without a dotenv
 * dependency, the same way the Razorpay live test does. Test-only: production
 * config loading belongs to the composition root, not to a package.
 */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (trimmed.length === 0 || trimmed.startsWith("#") || eq === -1) {
      continue;
    }
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const env: Env = { ...readEnvFile(join(repoRoot, ".env")), ...process.env };

/**
 * `COVENANT_AGENT_MODEL` is an operator preference addressed to the *router*:
 * it names the rung the router should open on, and the router honours it only
 * where that model is admissible. A raw session smoke has no router, so
 * inheriting the pin sent an operator's rung id straight at the provider and
 * got back a 400 that said nothing about the adapter under test. The global
 * pin is dropped here; the per-provider key still wins.
 */
function envFor(id: AgentProviderId): Env {
  return { ...env, COVENANT_AGENT_MODEL: "", COVENANT_AGENT_PROVIDER: id };
}

// Never log a key anywhere below: a transport failure carries the response
// body and the status, and deliberately not the request headers.
for (const id of AGENT_PROVIDERS) {
  const live = hasProviderApiKey(env, id);

  describe.skipIf(!live)(`${id} live smoke`, () => {
    it(
      "completes one tool-free turn against the configured model",
      { timeout: 120_000 },
      async () => {
        const created = createAgentSession({
          env: envFor(id),
          hook: hookOf(new RecordingSink()),
          dispatcher: new RecordingDispatcher(),
          txnId: null,
          systemPrompt: "Answer with a single word and nothing else.",
          tools: [],
          maxToolIterations: 1,
        });

        const turn = await created.session.turn({
          userMessage: "Reply with the word: covenant",
          toolResults: [],
        });
        await created.session.close();

        expect(created.provider).toBe(id);
        expect(created.model).toBe(resolveProviderModel(envFor(id), id));
        expect(turn.text.length).toBeGreaterThan(0);
        expect(turn.done).toBe(true);
      },
    );
  });
}

/**
 * The reporter line: a CI box with no credentials must still go green, and
 * whoever reads the output has to be able to see which providers were actually
 * exercised rather than assuming every one was.
 */
describe("provider live smoke gates", () => {
  it.each(AGENT_PROVIDERS)("reports the gate for %s", (id) => {
    const live = hasProviderApiKey(env, id);
    const keys = PROVIDER_SPECS[id].apiKeyEnvKeys.join(" or ");
    console.log(
      `[live] ${id}: ${live ? "running" : `skipped — set ${keys} to run it`}`,
    );
    expect(typeof live).toBe("boolean");
  });
});
