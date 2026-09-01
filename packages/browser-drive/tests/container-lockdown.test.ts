import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertContainerLocked,
  ContainerFlagError,
  ContainerLockdownError,
  FORBIDDEN_CONTAINER_ARGS,
} from "../src/container/docker-args.js";
import { seccompProfilePath } from "../src/container/profile-path.js";
import { specOf } from "../src/container/container-spec.js";
import {
  containerChromeArgs,
  containerRunArgs,
} from "../src/container/run-args.js";
import { FORBIDDEN_LAUNCH_ARGS } from "../src/chrome/launch-args.js";

const CONFIG = {
  image: "covenant-browser-sandbox:latest",
  seccompProfile: "/profiles/chrome.json",
  memoryMb: 1024,
  ttlSeconds: 1800,
  sessionId: "web_abc123",
};

const REQUEST = {
  userDataDir: "/unused",
  downloadDir: "/unused/downloads",
  surface: "container" as const,
  windowWidth: 1024,
  windowHeight: 720,
};

function args(): readonly string[] {
  return containerRunArgs(specOf(CONFIG), containerChromeArgs(REQUEST));
}

describe("the flags this package actually runs", () => {
  it("carries none of the forbidden ones", () => {
    expect(() => assertContainerLocked(args())).not.toThrow();
  });

  it("publishes no port on any interface", () => {
    const joined = args().join(" ");
    expect(joined).not.toContain("--publish");
    expect(joined).not.toMatch(/(^| )-p( |$)/);
    // The other half of the same promise: no debugging port inside, either.
    // The pipe that replaces it is wired by the entrypoint, which is checked
    // here too — a port added there would open a socket nothing else would see.
    expect(joined).not.toContain("--remote-debugging-port");
    const entrypoint = readFileSync(
      seccompProfilePath().replace(
        "chrome-sandbox.seccomp.json",
        "entrypoint.sh",
      ),
      "utf8",
    );
    expect(entrypoint).toContain("--remote-debugging-pipe");
    expect(entrypoint).not.toContain("--remote-debugging-port");
    expect(entrypoint).not.toContain("--no-sandbox");
  });

  it("gives the session a bridge of its own, never the host stack", () => {
    expect(args().join(" ")).toContain(
      "--network covenant-browse-net-web_abc123",
    );
  });

  it("mounts nothing from the host and keeps the root read-only", () => {
    const joined = args().join(" ");
    expect(joined).not.toMatch(/(^| )(-v|--volume|--mount)( |$)/);
    expect(args()).toContain("--read-only");
  });
});

describe("who the container runs as", () => {
  it("is a non-root uid with every capability dropped but one", () => {
    const joined = args().join(" ");
    expect(joined).toContain("--user 1001:1001");
    expect(joined).toContain("--cap-drop ALL");
    // CAP_SYS_CHROOT is what lets Chrome keep its own sandbox; see docker-args.
    expect(joined).toContain("--cap-add SYS_CHROOT");
    expect(joined).not.toContain("SYS_ADMIN");
  });
});

describe("what the run bounds and names", () => {
  it("bounds memory, processes and lifetime", () => {
    const joined = args().join(" ");
    expect(joined).toContain("--memory 1024m");
    expect(joined).toContain("--pids-limit 512");
    expect(joined).toContain("COVENANT_TTL_SECONDS=1800");
  });

  /**
   * Measured, not guessed. At 64m this filled on any real storefront (amazon
   * peaked at 123 MiB of scratch, flipkart at 168) and the renderer died
   * silently — nothing reports a full tmpfs, so shrinking it again would
   * reintroduce a crash that looks like anything but its cause.
   */
  it("gives Chrome enough scratch space to load a real shop", () => {
    const joined = args().join(" ");
    expect(joined).toContain("/tmp:rw,size=512m,mode=1777");
    const tmp = /\/tmp:rw,size=(\d+)m/.exec(joined);
    expect(Number(tmp?.[1] ?? 0)).toBeGreaterThanOrEqual(256);
  });

  it("names the session on the container, so an orphan can be found", () => {
    const joined = args().join(" ");
    expect(joined).toContain("covenant.browser-sandbox=true");
    expect(joined).toContain("covenant.session=web_abc123");
  });
});

describe("flags that would hollow the container out", () => {
  it.each([
    ["--privileged"],
    ["-v", "/:/host"],
    ["--volume", "/etc:/etc"],
    ["--mount", "type=bind,src=/,dst=/host"],
    ["-p", "9222:9222"],
    ["--publish", "127.0.0.1:9222:9222"],
    ["--network", "host"],
    ["--pid", "host"],
    ["--userns", "host"],
    ["--cap-add", "SYS_ADMIN"],
    ["--security-opt", "seccomp=unconfined"],
    ["--user", "root"],
  ])("refuses %s", (...flag: string[]) => {
    expect(() => assertContainerLocked([...args(), ...flag])).toThrow(
      ContainerFlagError,
    );
  });

  it("refuses a run that simply omits the lockdown", () => {
    expect(() => assertContainerLocked(["run", "--rm", "image"])).toThrow(
      ContainerLockdownError,
    );
  });

  it("reads both spellings, so `--flag value` is no way around it", () => {
    expect(() => assertContainerLocked([...args(), "--userns=host"])).toThrow();
    expect(() =>
      assertContainerLocked([...args(), "--userns", "host"]),
    ).toThrow();
  });

  it("names every forbidden flag in its own error", () => {
    for (const flag of FORBIDDEN_CONTAINER_ARGS) {
      expect(() => assertContainerLocked([...args(), flag])).toThrow();
    }
  });
});

describe("Chrome's own flags, inside the container", () => {
  it("still carries none of the sandbox-breaking ones", () => {
    const chrome = containerChromeArgs(REQUEST);
    for (const forbidden of FORBIDDEN_LAUNCH_ARGS) {
      const present = chrome.some(
        (arg) =>
          arg === forbidden ||
          (arg.startsWith(`${forbidden}=`) && forbidden !== "--user-data-dir"),
      );
      expect(present).toBe(false);
    }
    expect(chrome).not.toContain("--no-sandbox");
  });

  it("points the profile inside the image and nowhere else", () => {
    expect(containerChromeArgs(REQUEST)).toContain(
      "--user-data-dir=/home/shopper/profile",
    );
  });
});

/**
 * The seccomp profile is the reason `--no-sandbox` is unnecessary, so what it
 * changed from Docker's default is checked rather than trusted: user, mount,
 * pid and network namespaces may be created; cgroup, uts and ipc still may not.
 */
describe("the seccomp profile", () => {
  const profile = JSON.parse(readFileSync(seccompProfilePath(), "utf8")) as {
    defaultAction: string;
    syscalls: { names: string[]; args?: { value: number; op: string }[] }[];
  };

  it("is still deny-by-default", () => {
    expect(profile.defaultAction).toBe("SCMP_ACT_ERRNO");
  });

  it("permits exactly the namespaces Chrome's sandbox is built from", () => {
    const masks = profile.syscalls
      .flatMap((group) => group.args ?? [])
      .filter((arg) => arg.op === "SCMP_CMP_MASKED_EQ")
      .map((arg) => arg.value);
    // 0x0E000000 — cgroup, uts and ipc remain denied without CAP_SYS_ADMIN.
    expect(masks).toContain(0x0e000000);
    expect(masks).not.toContain(0x7e020000);
  });
});
