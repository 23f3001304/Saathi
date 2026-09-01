import { runT1 } from "../attacks/t1.js";
import { runT27 } from "../attacks/t27.js";
import { runT31 } from "../attacks/t31.js";
import { runFalsePositives } from "../fp/index.js";
import { verifyChain } from "../report/ledger.js";
import { printSummary } from "../summary.js";
import { bootOrExit, newTranscript } from "./boot.js";

const tx = newTranscript();
const harness = await bootOrExit(tx);

// Demo order: the poisoning first because it needs no prior state, then the
// replay, then the downgrade — and the honest measurement last, so the number
// lands after the audience has seen what produced it.
const attacks = [
  await runT1(harness, tx),
  await runT31(harness, tx),
  await runT27(harness, tx),
];

const outcome = await runFalsePositives(harness, tx, attacks);
printSummary(tx, attacks, outcome);

const chain = await verifyChain(harness);
tx.section("the chain");
tx.detail("hash chain verified", chain.ok ? "yes" : "NO");
tx.detail("height", String(chain.height));

const through = attacks.filter((attack) => !attack.blocked);
for (const attack of through) {
  tx.raw(`  ${attack.attackId} GOT THROUGH: ${attack.notes.join("; ") || "see the transcript above"}`);
}
tx.verdictLine(
  through.length === 0 && chain.ok
    ? "all attacks blocked, ledger chain intact"
    : "BUILD FAILURE - an attack got through or the chain broke",
  through.length === 0 && chain.ok,
);
process.exitCode = through.length === 0 && chain.ok ? 0 : 1;
