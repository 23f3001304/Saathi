import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { SANDBOX_LABEL } from "./docker-args.js";

const run = promisify(execFile);

/** Long enough for a cold `docker network create`, short enough to notice. */
const CLI_TIMEOUT_MS = 20_000;

export class DockerUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(
      `The containerised browser sandbox needs a working Docker daemon and the ${"covenant-browser-sandbox"} image: ${reason}`,
    );
    this.name = "DockerUnavailableError";
  }
}

async function docker(args: readonly string[]): Promise<string> {
  const { stdout } = await run("docker", [...args], {
    timeout: CLI_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout.trim();
}

/** Quiet on failure: every caller here treats "it did not work" as the answer. */
async function tryDocker(args: readonly string[]): Promise<string | null> {
  try {
    return await docker(args);
  } catch {
    return null;
  }
}

/**
 * Whether this machine can run the hardened path at all. Probed once rather
 * than assumed, because the whole point of the in-process fallback is that a
 * laptop with no Docker Desktop still gets a working demo.
 */
export async function dockerSandboxReady(
  image: string,
): Promise<string | null> {
  const version = await tryDocker(["version", "--format", "{{.Server.Os}}"]);
  if (version === null) {
    return "no Docker daemon answered `docker version`";
  }
  const found = await tryDocker([
    "image",
    "inspect",
    image,
    "--format",
    "{{.Id}}",
  ]);
  if (found === null) {
    return `the image "${image}" is not built here — run \`docker compose build browser-sandbox\``;
  }
  return null;
}

export async function createNetwork(name: string): Promise<void> {
  const created = await tryDocker([
    "network",
    "create",
    "--label",
    `${SANDBOX_LABEL}=true`,
    name,
  ]);
  if (created === null) {
    throw new DockerUnavailableError(`could not create the network "${name}"`);
  }
}

export async function removeNetwork(name: string): Promise<void> {
  await tryDocker(["network", "rm", name]);
}

export async function removeContainer(name: string): Promise<void> {
  await tryDocker(["rm", "--force", "--volumes", name]);
}

/**
 * The session-to-container binding, checked rather than assumed. `docker run`
 * was given a name and a label; this reads the label back off the container
 * that actually started and refuses if it names a different session — so an
 * attach can never land on a window belonging to somebody else's errand.
 */
export async function labelledSession(name: string): Promise<string | null> {
  return await tryDocker([
    "inspect",
    "--format",
    `{{index .Config.Labels "covenant.session"}}`,
    name,
  ]);
}

async function idsWithLabel(
  kind: "ps" | "network",
): Promise<readonly string[]> {
  const args =
    kind === "ps"
      ? ["ps", "--all", "--quiet", "--filter", `label=${SANDBOX_LABEL}=true`]
      : ["network", "ls", "--quiet", "--filter", `label=${SANDBOX_LABEL}=true`];
  const listed = await tryDocker(args);
  return listed === null || listed === "" ? [] : listed.split(/\r?\n/);
}

export interface ReapReport {
  readonly containers: number;
  readonly networks: number;
}

/**
 * Called at boot, because a container must not outlive the process that owns
 * it just because that process died badly. `docker run --rm` cleans up when the
 * client exits normally; a `SIGKILL`ed agent-host never gets to exit at all,
 * and the daemon keeps the container running until its own ceiling fires. This
 * finds those by label and ends them before a new session starts.
 */
export async function reapOrphans(): Promise<ReapReport> {
  const containers = await idsWithLabel("ps");
  for (const id of containers) {
    await removeContainer(id);
  }
  const networks = await idsWithLabel("network");
  for (const id of networks) {
    await removeNetwork(id);
  }
  return { containers: containers.length, networks: networks.length };
}
