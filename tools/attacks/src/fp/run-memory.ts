import { randomUUID } from "node:crypto";

import { epochSeconds, mintJti, signCompact } from "../crypto/jws.js";
import type { WriteOutcome } from "../flow/memory.js";
import { writeMemory } from "../flow/memory.js";
import { demoBounds } from "../fixtures/demo.js";
import type { Harness } from "../harness.js";
import { issueIntent } from "../mandates/intent-mandate.js";
import { GATEWAY_AUDIENCE } from "../protocol.js";
import type { Transcript } from "../report/transcript.js";
import { memoryCost, memoryDetector, remedyOf } from "./attribution.js";
import type { MemoryScenario, ScenarioContext, ScenarioResult } from "./types.js";

/** A merchant-signed attestation, so the P2 channel has a signature to verify. */
function merchantAttestation(harness: Harness): { jwt: string; jti: string } {
  const iat = epochSeconds(new Date());
  const jti = mintJti();
  const iss = harness.merchantIss;
  return {
    jti,
    jwt: signCompact(harness.ring, "merchant", {
      iss,
      sub: iss,
      aud: GATEWAY_AUDIENCE,
      iat,
      exp: iat + 3600,
      jti,
    }),
  };
}

/** Each scenario gets its own memory namespace: no cross-contamination. */
function contextFor(harness: Harness, id: string): ScenarioContext {
  const intent = issueIntent(harness.ring, {
    tenantId: harness.tenantId,
    description: `Corpus scenario ${id}`,
    agentInstanceId: harness.agentUrn,
    bounds: demoBounds({ merchantIss: harness.merchantIss, category: `fp-${id}` }),
    issuedAt: new Date(),
  });
  const attestation = merchantAttestation(harness);
  return {
    userId: `${harness.userIss}#fp-${id}-${randomUUID().slice(0, 8)}`,
    intentJwt: intent.jwt,
    intentJti: intent.jti,
    merchantSig: attestation.jwt,
    merchantJti: attestation.jti,
  };
}

const ACCEPTED: readonly string[] = ["committed", "shadowed", "quarantined"];

type Attribution = Pick<ScenarioResult, "detector" | "remedy" | "cost" | "detail">;

function allowedFields(result: WriteOutcome): Attribution {
  return {
    detector: null,
    remedy: null,
    cost: null,
    detail: `${result.status} at ${result.tierGranted ?? "?"}`,
  };
}

function blockedFields(result: WriteOutcome, channel: string): Attribution {
  return {
    detector: memoryDetector(result),
    remedy: remedyOf(result.reply.body["to_pass"]),
    cost: memoryCost(result, channel),
    detail: result.human ?? result.status,
  };
}

async function runOne(
  harness: Harness,
  scenario: MemoryScenario,
): Promise<ScenarioResult> {
  const context = contextFor(harness, scenario.id);
  for (const seed of scenario.seeds ?? []) {
    await writeMemory(harness, seed(context));
  }
  const spec = scenario.write(context);
  const result = await writeMemory(harness, spec);
  const allowed = ACCEPTED.includes(result.status);
  return {
    id: scenario.id,
    family: scenario.family,
    description: scenario.description,
    surface: "memory",
    outcome: allowed ? "allowed" : "blocked",
    reasonCode: result.reasonCode,
    ...(allowed ? allowedFields(result) : blockedFields(result, spec.channel)),
  };
}

/**
 * Every scenario is run against the live gateway; nothing here is simulated,
 * and a scenario the harness expected to pass but that the gate refused is
 * reported as a false block rather than quietly re-specified.
 */
export async function runMemoryScenarios(
  harness: Harness,
  scenarios: readonly MemoryScenario[],
  tx: Transcript,
): Promise<readonly ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const result = await runOne(harness, scenario);
    results.push(result);
    tx.result(
      result.id,
      result.outcome === "allowed",
      `${result.description} -> ${result.reasonCode ?? result.detail}`,
    );
  }
  return results;
}
