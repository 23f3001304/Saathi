import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = ["docker", "chrome-sandbox.seccomp.json"];
const MAX_CLIMB = 4;

export class SeccompProfileMissingError extends Error {
  constructor(from: string) {
    super(
      `The Chrome seccomp profile was not found above "${from}". It ships with @covenant/browser-drive at docker/chrome-sandbox.seccomp.json; without it a container can only run Chrome with its own sandbox switched off, which this package will not do.`,
    );
    this.name = "SeccompProfileMissingError";
  }
}

/**
 * Docker's default seccomp profile denies `clone` with `CLONE_NEWUSER`, which
 * is exactly the call Chrome's namespace sandbox is built out of. The usual
 * answer is `--no-sandbox`; this file is the other one. It is Docker's own
 * default with a single, narrow change — user, mount, pid and network
 * namespaces may be created, while cgroup, uts and ipc still may not — so the
 * container keeps the rest of the default filter and Chrome keeps its sandbox.
 *
 * Found by climbing, like `fixtureShopDir`, because `src/` and `dist/src/` sit
 * at different distances from the package root and the host may load either.
 */
export function seccompProfilePath(): string {
  const from = dirname(fileURLToPath(import.meta.url));
  let at = from;
  for (let climb = 0; climb <= MAX_CLIMB; climb += 1) {
    const candidate = resolve(at, ...MARKER);
    if (existsSync(candidate)) {
      // Forward slashes throughout: this string is handed to the docker CLI.
      return candidate.replaceAll("\\", "/");
    }
    at = dirname(at);
  }
  throw new SeccompProfileMissingError(from);
}
