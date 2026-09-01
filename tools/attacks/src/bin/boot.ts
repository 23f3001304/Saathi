import type { Harness } from "../harness.js";
import { createHarness, probeGateway } from "../harness.js";
import { Transcript } from "../report/transcript.js";

/**
 * The harness boots nothing (that is the `run-all` contract), so an
 * unreachable gateway is a readable message and a non-zero exit, never a wall
 * of connection-refused stack traces in the middle of a screen recording.
 */
export async function bootOrExit(tx: Transcript): Promise<Harness> {
  let harness: Harness;
  try {
    harness = createHarness();
  } catch (cause) {
    tx.raw(`\n  cannot start: ${cause instanceof Error ? cause.message : "unknown"}\n`);
    process.exit(2);
  }
  const readiness = await probeGateway(harness);
  if (!readiness.ok) {
    tx.raw(`\n  gateway not ready: ${readiness.detail}`);
    tx.raw(`  start it first, e.g. COVENANT_RAIL=fake node apps/gateway-svc/dist/src/index.js\n`);
    process.exit(2);
  }
  tx.raw(`  gateway ${harness.env.gatewayUrl} ready  ${readiness.detail}`);
  tx.raw(`  keys     ${harness.env.keyDir}`);
  return harness;
}

export function finish(blocked: boolean): void {
  process.exitCode = blocked ? 0 : 1;
}

export function newTranscript(): Transcript {
  return new Transcript();
}
