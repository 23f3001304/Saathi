import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

const APP_DIR = join(REPO_ROOT, "apps", "gateway-svc");

const ENTRY = join(APP_DIR, "dist", "src", "index.js");

function tscBin(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
}

/**
 * The suite drives the gateway as a **process**, not as an import: the
 * `attacks-are-black-box` dependency-cruiser rule forbids `tools/attacks` from
 * importing `apps/`, and honouring that in the test is the point — an attack
 * harness with in-process access to the thing it attacks proves nothing.
 *
 * The repo's CI gate is `lint && depcruise && test` with no build step, so the
 * suite compiles the app itself. `tsc -b` is incremental and a no-op when the
 * output is current.
 */
function tsc(args: readonly string[]): string {
  const run = spawnSync(process.execPath, [tscBin(), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return `${run.stdout}\n${run.stderr}`;
}

export function ensureBuilt(): void {
  const incremental = tsc(["-b", APP_DIR]);
  if (existsSync(ENTRY)) {
    return;
  }
  // A stale `.tsbuildinfo` can call a project current while its output is gone.
  const forced = tsc(["-b", "--force", APP_DIR]);
  if (!existsSync(ENTRY)) {
    throw new Error(`gateway-svc is not built:\n${incremental}\n${forced}`);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address === null || typeof address === "string" ? 0 : address.port;
      server.close(() => {
        resolvePort(port);
      });
    });
  });
}

async function waitForHealth(url: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // The process is still binding its port.
    }
    if (Date.now() > deadline) {
      throw new Error(`gateway did not answer /healthz at ${url}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

export interface RunningGateway {
  readonly url: string;
  readonly keyDir: string;
  stop(): Promise<void>;
}

/** A temp database and a freshly minted trust ring: no repo state, no secrets. */
export async function startGatewayProcess(): Promise<RunningGateway> {
  ensureBuilt();
  const dir = mkdtempSync(join(tmpdir(), "covenant-attacks-"));
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      COVENANT_DB: join(dir, "covenant.db"),
      COVENANT_KEY_DIR: join(dir, "keys"),
      COVENANT_RAIL: "fake",
      COVENANT_TENANT: "tnt_demo",
      LOG_LEVEL: "fatal",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url, 60_000);
  return {
    url,
    keyDir: join(dir, "keys"),
    stop: () =>
      new Promise<void>((done) => {
        child.once("exit", () => {
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            // Windows can hold the WAL file a moment after close.
          }
          done();
        });
        child.kill("SIGTERM");
      }),
  };
}
