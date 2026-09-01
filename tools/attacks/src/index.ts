/**
 * `tools/attacks` — Covenant's adversarial harness and its honest
 * false-positive measurement. Black-box HTTP only: nothing here imports a
 * workspace package, and dependency-cruiser's `attacks-are-black-box` rule
 * fails the build if that ever changes.
 */
export { runT1 } from "./attacks/t1.js";
export { runT27 } from "./attacks/t27.js";
export { runT31 } from "./attacks/t31.js";
export type { AttackResult, AttackStep } from "./attacks/result.js";
export { createHarness, probeGateway } from "./harness.js";
export type { Harness } from "./harness.js";
export { loadHarnessEnv } from "./env.js";
export type { HarnessEnv } from "./env.js";
export { CORPUS_SIZE, runFalsePositives } from "./fp/index.js";
export type { FpOutcome } from "./fp/index.js";
export { buildMatrix, byDetector } from "./fp/matrix.js";
export type { Matrix } from "./fp/matrix.js";
export type { ScenarioResult } from "./fp/types.js";
export { Transcript } from "./report/transcript.js";
export { printSummary } from "./summary.js";
