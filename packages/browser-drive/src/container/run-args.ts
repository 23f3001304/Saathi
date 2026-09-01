import { sandboxArgs } from "../chrome/launch-args.js";
import type { LaunchRequest } from "../ports.js";
import {
  assertContainerLocked,
  CONTAINER_PROFILE_DIR,
  ContainerFlagError,
  SANDBOX_LABEL,
  SESSION_LABEL,
} from "./docker-args.js";

export interface ContainerSpec {
  readonly sessionId: string;
  readonly image: string;
  readonly containerName: string;
  readonly networkName: string;
  /** Host path to the seccomp profile that lets Chrome build its own sandbox. */
  readonly seccompProfile: string;
  readonly memoryMb: number;
  readonly ttlSeconds: number;
  /** `Default/Preferences`, written by the entrypoint inside the container. */
  readonly prefsJson: string;
}

/**
 * DECISION: `--cap-drop=ALL --cap-add=SYS_CHROOT`, and nothing else.
 *
 * Chrome's namespace sandbox needs two things Docker denies by default: to
 * `clone` with `CLONE_NEWUSER`, which the seccomp profile below grants, and to
 * `chroot` inside the namespace it just made, which Docker's own profile gates
 * on `CAP_SYS_CHROOT` being in the bounding set. Adding that one capability
 * back is what makes `--no-sandbox` unnecessary. It grants the process itself
 * nothing — it runs as uid 1001, which holds no effective capabilities — it
 * only stops the seccomp filter from vetoing the syscall.
 */
/** Who it is and where it can be found: one name, one network, two labels. */
function identityArgs(spec: ContainerSpec): readonly string[] {
  return [
    "--name",
    spec.containerName,
    "--label",
    `${SANDBOX_LABEL}=true`,
    "--label",
    `${SESSION_LABEL}=${spec.sessionId}`,
    "--network",
    spec.networkName,
  ];
}

/** Who it runs as, and what it is not allowed to do. */
function privilegeArgs(spec: ContainerSpec): readonly string[] {
  return [
    "--user",
    "1001:1001",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "SYS_CHROOT",
    "--security-opt",
    "no-new-privileges",
    "--security-opt",
    `seccomp=${spec.seccompProfile}`,
  ];
}

/** What it may consume, and where anything it writes is allowed to land. */
function resourceArgs(spec: ContainerSpec): readonly string[] {
  return [
    "--memory",
    `${spec.memoryMb}m`,
    "--memory-swap",
    `${spec.memoryMb}m`,
    "--pids-limit",
    "512",
    "--cpus",
    "2",
    // Kept, but measured rather than assumed: across every heavy-storefront
    // run instrumented here, /dev/shm stayed at 0.0 MiB used — this Chrome
    // puts its scratch in /tmp instead, which is why that mount is the one
    // that had to grow. Raising this to 2g changed nothing. It stays at 512m
    // because a Chrome that does reach for shared memory should find some, not
    // because anything observed here needed it.
    "--shm-size",
    "512m",
    // Read-only root with every writable path on tmpfs: the profile, the
    // cookies and anything a page persuades Chrome to save live in RAM and
    // cease to exist when the container stops. There is no layer to inspect
    // afterwards and no host directory to inspect at all.
    "--read-only",
    "--tmpfs",
    "/home/shopper:rw,size=512m,mode=0700,uid=1001,gid=1001",
    // MEASURED, not guessed: a real storefront drives this well past the 64m
    // it used to have — amazon.in/s peaked at 123 MiB and flipkart at 168 MiB
    // of scratch. A tmpfs that fills does not report ENOSPC anywhere useful;
    // the renderer simply dies, with the container healthy and no kernel OOM
    // kill, which is a miserable thing to debug. Sized to roughly 3x the worst
    // reading. This is a cap, not a reservation: tmpfs pages are charged to
    // the cgroup only as they are used, so an idle session still costs nothing.
    "--tmpfs",
    "/tmp:rw,size=512m,mode=1777",
  ];
}

export function containerRunArgs(
  spec: ContainerSpec,
  chromeArgs: readonly string[],
): readonly string[] {
  const args = [
    "run",
    "--rm",
    "-i",
    "--init",
    ...identityArgs(spec),
    ...privilegeArgs(spec),
    ...resourceArgs(spec),
    "-e",
    `COVENANT_TTL_SECONDS=${spec.ttlSeconds}`,
    "-e",
    `COVENANT_CHROME_PREFS=${spec.prefsJson}`,
    spec.image,
    ...chromeArgs,
  ];
  assertContainerLocked(args);
  return args;
}

/**
 * The Chrome flags, container-side. `sandboxArgs` is shared with the native
 * surface and asserts itself; only the three additions below are new, and
 * `--user-data-dir` — forbidden on the native surface precisely so nobody can
 * aim Chrome at the user's real profile — is permitted here at exactly one
 * value, a path inside an image that contains no user profile to aim at.
 */
export function containerChromeArgs(request: LaunchRequest): readonly string[] {
  const extra = [
    "--headless=new",
    `--user-data-dir=${CONTAINER_PROFILE_DIR}`,
    "--hide-scrollbars",
  ];
  const profile = extra.find((arg) => arg.startsWith("--user-data-dir="));
  if (profile !== `--user-data-dir=${CONTAINER_PROFILE_DIR}`) {
    throw new ContainerFlagError(String(profile));
  }
  return [...sandboxArgs(request), ...extra];
}
