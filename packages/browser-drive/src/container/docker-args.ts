/** Paths inside the image. Nothing here is a host path, and none is a mount. */
export const CONTAINER_PROFILE_DIR = "/home/shopper/profile";
export const CONTAINER_DOWNLOAD_DIR = "/home/shopper/downloads";

/** The label every container and network carries, so orphans can be found. */
export const SANDBOX_LABEL = "covenant.browser-sandbox";
export const SESSION_LABEL = "covenant.session";

/**
 * The docker flags that would hollow out the container, as data — the same
 * arrangement, and the same reasoning, as `FORBIDDEN_LAUNCH_ARGS`. Each of
 * these is the shortcut somebody reaches for when Chrome will not start or a
 * file will not read, and each one gives the page inside the container a way
 * out of it.
 */
export const FORBIDDEN_CONTAINER_ARGS: readonly string[] = [
  "--privileged",
  "-v",
  "--volume",
  "--mount",
  "--volumes-from",
  "-p",
  "--publish",
  "-P",
  "--publish-all",
  "--expose",
  // The network is named, not shared: this session gets a bridge of its own, so
  // only the host's own stack is forbidden here rather than the flag itself.
  "--net=host",
  "--network=host",
  "--pid",
  "--ipc",
  "--uts",
  "--userns",
  "--device",
  "--device-cgroup-rule",
  "--cgroupns",
  "--cap-add=ALL",
  "--cap-add=SYS_ADMIN",
  "--cap-add=SYS_PTRACE",
  "--cap-add=SYS_MODULE",
  "--cap-add=DAC_READ_SEARCH",
  "--security-opt=seccomp=unconfined",
  "--security-opt=apparmor=unconfined",
  "--security-opt=systempaths=unconfined",
  "--security-opt=label=disable",
  "--user=root",
  "--user=0",
  "-u=root",
  "-u=0",
];

/** Flags whose absence is itself the hole. Checked positively, not implied. */
export const REQUIRED_CONTAINER_ARGS: readonly string[] = [
  "--rm",
  "--read-only",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
];

export class ContainerFlagError extends Error {
  constructor(readonly flag: string) {
    super(
      `Refusing to run the browser container with "${flag}": it removes a boundary this session depends on. Fix the environment rather than the flag.`,
    );
    this.name = "ContainerFlagError";
  }
}

export class ContainerLockdownError extends Error {
  constructor(readonly missing: string) {
    super(
      `Refusing to run the browser container without "${missing}". The lockdown is not advisory — a container missing one of these is not the sandbox this session promised.`,
    );
    this.name = "ContainerLockdownError";
  }
}

/**
 * `docker run` accepts both `--flag value` and `--flag=value`; a denylist that
 * only understands one of them is a denylist with a hole in it.
 */
function normalized(args: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const next = args[index + 1];
    const pairs =
      arg.startsWith("-") &&
      !arg.includes("=") &&
      next !== undefined &&
      !next.startsWith("-");
    out.push(pairs ? `${arg}=${next}` : arg);
    index += pairs ? 1 : 0;
  }
  return out;
}

function assertNothingWeakened(tokens: readonly string[]): void {
  for (const token of tokens) {
    const forbidden = FORBIDDEN_CONTAINER_ARGS.find(
      (flag) => token === flag || token.startsWith(`${flag}=`),
    );
    if (forbidden !== undefined) {
      throw new ContainerFlagError(token);
    }
  }
}

function assertLockdownPresent(tokens: readonly string[]): void {
  for (const required of REQUIRED_CONTAINER_ARGS) {
    if (!tokens.some((token) => token === required)) {
      throw new ContainerLockdownError(required);
    }
  }
  if (!tokens.some((token) => token.startsWith("--memory="))) {
    throw new ContainerLockdownError("--memory");
  }
  if (!tokens.some((token) => token.startsWith("--security-opt=seccomp="))) {
    throw new ContainerLockdownError("--security-opt seccomp=<profile>");
  }
}

/**
 * Both halves, because either alone is a false comfort: a run with no forbidden
 * flag but no `--cap-drop` is wide open, and a run with every required flag
 * plus `-v /:/host` is wider.
 */
export function assertContainerLocked(args: readonly string[]): void {
  const tokens = normalized(args);
  assertNothingWeakened(tokens);
  assertLockdownPresent(tokens);
}
