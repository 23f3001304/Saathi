import { runT1 } from "../attacks/t1.js";
import { runT27 } from "../attacks/t27.js";
import { runT31 } from "../attacks/t31.js";
import { runFalsePositives } from "../fp/index.js";
import { printSummary } from "../summary.js";
import { Transcript } from "../report/transcript.js";
import { bootOrExit, newTranscript } from "./boot.js";

const tx = newTranscript();
const harness = await bootOrExit(tx);

/**
 * `pnpm fp` is standalone, so it fills the true-block row of its own matrix by
 * running the three attacks silently. A confusion matrix that took the attack
 * column on trust would be measuring only half of itself.
 */
const quiet = new Transcript(false);
const attacks = [
  await runT1(harness, quiet),
  await runT31(harness, quiet),
  await runT27(harness, quiet),
];

const outcome = await runFalsePositives(harness, tx, attacks);
printSummary(tx, attacks, outcome);
process.exitCode = outcome.matrix.falseAllows === 0 ? 0 : 1;
