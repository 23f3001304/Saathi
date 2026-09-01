// Start over: an empty ledger, a fresh trust ring, and nothing left over from
// a previous demo.
//
// This deletes an append-only audit trail, which is the one thing this system
// promises never to edit. That promise is about the *running* system — the
// ledger cannot be rewritten in place, only appended to, and any tampering
// shows up when replay compares state hashes. Throwing the whole file away and
// starting again is a different act, and it is deliberately made loud: it
// refuses without `--yes`, it refuses while the services are up, and it names
// every path before it touches one.
import { rm, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";

const root = join(import.meta.dirname, "..");

const TARGETS = [
  {
    path: join(root, "data"),
    what: "the ledger, every memory, mandate and transaction",
  },
  {
    path: join(root, "keys"),
    what: "the trust ring — every signature stops verifying",
  },
];

/** Ports whose owner holds these files open, and would rewrite them on exit. */
const SERVICES = [
  { port: 8787, name: "gateway-svc" },
  { port: 8788, name: "agent-host" },
];

function listening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(400, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function present(path) {
  return (await stat(path).catch(() => null)) !== null;
}

async function main() {
  const confirmed = process.argv.includes("--yes");

  const up = [];
  for (const service of SERVICES) {
    if (await listening(service.port)) up.push(service);
  }
  if (up.length > 0) {
    const names = up.map((s) => `${s.name} (:${s.port})`).join(", ");
    console.error(
      `Refusing: ${names} still running.\n` +
        "They hold the ledger open and would write it back on exit. Stop them first.",
    );
    process.exit(1);
  }

  console.log("This will delete:");
  for (const target of TARGETS) {
    const mark = (await present(target.path)) ? "-" : "  (absent)";
    console.log(`  ${mark} ${target.path}\n      ${target.what}`);
  }
  console.log(
    "\nRazorpay items are NOT touched: they live in your Razorpay account,\n" +
      "not in this repo. Retire them from the merchant app if you want them gone.",
  );

  if (!confirmed) {
    console.log("\nNothing deleted. Re-run with --yes to go ahead.");
    return;
  }

  for (const target of TARGETS) {
    await rm(target.path, { recursive: true, force: true });
    console.log(`deleted ${target.path}`);
  }

  const left = await readdir(root);
  console.log(
    `\nDone. Start gateway-svc next: it mints a fresh trust ring into keys/ and\n` +
      `creates data/covenant.db at height zero. Then re-enrol any merchant with\n` +
      `  pnpm --filter @covenant/gateway-svc merchant:onboard <profile.json>\n` +
      `(${left.length} entries remain at the repo root, untouched.)`,
  );
}

await main();
