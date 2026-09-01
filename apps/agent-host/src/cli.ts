import { buildRoot } from "./composition-root.js";
import { loadConfig } from "./config.js";
import type { PurchaseResult } from "./purchase/purchase-result.js";
import { trailLines } from "./purchase/trail.js";

const USAGE = 'usage: node dist/src/cli.js buy "<what you want to buy>"\n';

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * The fastest way to see the whole system work: one process, one sentence, and
 * the causal trail printed where a judge is already looking. It drives the same
 * `PurchaseRunner` the HTTP surface drives — there is no CLI-only shortcut past
 * the hook, the write gate or the eight seals.
 */
export async function buy(request: string): Promise<PurchaseResult> {
  // The terminal has no hold-to-sign button, so the gates release themselves.
  // Every other guard — the hook, the write gate, the verdict pipeline — is
  // exactly the one the browser path runs.
  const root = buildRoot({ ...loadConfig(process.env), autoSign: true });
  try {
    const result = await root.buyer.runner.run(request);
    for (const line of root.hub.snapshot()) {
      if (line.kind === "message") {
        write(`agent    ${line.text}`);
      }
    }
    for (const line of trailLines(result)) {
      write(line);
    }
    return result;
  } finally {
    await root.session.close();
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  const request = rest.join(" ").trim();
  if (command !== "buy" || request.length === 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  const result = await buy(request);
  return result.status === "failed" ? 1 : 0;
}

if (process.argv[1]?.endsWith("cli.js") === true) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}
