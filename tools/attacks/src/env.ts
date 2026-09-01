import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface HarnessEnv {
  readonly gatewayUrl: string;
  readonly keyDir: string;
  readonly tenantId: string;
}

export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8787";

const RING_FILE = "trust-ring.json";

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, key: string): string | null {
  const value = env[key];
  return value === undefined || value.trim() === "" ? null : value.trim();
}

/**
 * The harness needs the same `COVENANT_KEY_DIR` the running gateway was given
 * (§6.7 rule 6): the user and merchant private keys are how the demo's agents
 * sign, and an attack that could not sign a genuine credential could only ever
 * demonstrate that garbage is rejected.
 *
 * With no explicit variable the directory is discovered by walking up from the
 * working directory, so `pnpm --filter @covenant/attacks t1` (cwd
 * `tools/attacks`) and a repo-root invocation both find `covenant/keys`.
 */
export function findKeyDir(start: string): string {
  let cursor = resolve(start);
  for (;;) {
    const candidate = join(cursor, "keys");
    if (existsSync(join(candidate, RING_FILE))) {
      return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(
        `no keys/${RING_FILE} found above ${start}; set COVENANT_KEY_DIR to the key directory the gateway booted with`,
      );
    }
    cursor = parent;
  }
}

export function loadHarnessEnv(
  env: Env = process.env,
  cwd: string = process.cwd(),
): HarnessEnv {
  const declared = read(env, "COVENANT_KEY_DIR");
  return {
    gatewayUrl: read(env, "COVENANT_GATEWAY_URL") ?? DEFAULT_GATEWAY_URL,
    keyDir:
      declared === null
        ? findKeyDir(cwd)
        : isAbsolute(declared)
          ? declared
          : resolve(cwd, declared),
    tenantId: read(env, "COVENANT_TENANT") ?? "tnt_demo",
  };
}
