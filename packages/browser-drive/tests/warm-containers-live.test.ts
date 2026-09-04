import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { dockerSandboxReady } from "../src/container/docker-cli.js";
import { seccompProfilePath } from "../src/container/profile-path.js";
import { WarmReaderBrowsers } from "../src/container/warm-reader.js";
import { WarmWindows } from "../src/container/warm-window.js";
import { IMAGE, LAUNCH_MS, MEMORY_MB } from "./container-rig.js";

const SKIP_REASON = await dockerSandboxReady(IMAGE);
if (SKIP_REASON !== null) {
  console.warn(`[browser-drive] warm containers SKIPPED: ${SKIP_REASON}`);
}

const CONFIG = {
  image: IMAGE,
  seccompProfile: seccompProfilePath(),
  memoryMb: MEMORY_MB,
  ttlSeconds: 300,
} as const;

const TEMPLATE = {
  userDataDir: "",
  downloadDir: "",
  surface: "container",
  windowWidth: 900,
  windowHeight: 700,
} as const;

/** Every warm container still running. Empty is the only pass after a drain. */
function liveWarmContainers(): readonly string[] {
  const listed = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  return listed
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name.startsWith("covenant-browse-warm_"));
}

describe.skipIf(SKIP_REASON !== null)("warm containers, live", () => {
  it(
    "hands a research batch a container it did not wait for",
    async () => {
      const warm = new WarmReaderBrowsers(CONFIG, 1);
      warm.prime();
      // The wait is the point: after it, a claim must not launch anything.
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      expect(warm.ready).toBe(1);
      const surface = warm.surface();
      const began = Date.now();
      const browser = await surface.open();
      const claimedMs = Date.now() - began;
      expect(browser.connected).toBe(true);
      // A cold container start is seconds; a claim is a shift off an array.
      expect(claimedMs).toBeLessThan(1_000);
      await surface.close();
      await warm.drain();
      expect(liveWarmContainers()).toEqual([]);
    },
    LAUNCH_MS,
  );

  it(
    "never gives two sessions the same window",
    async () => {
      const warm = new WarmWindows(CONFIG, TEMPLATE, 2);
      warm.prime();
      const first = await warm.launcherFor("web_one").launch(TEMPLATE);
      const second = await warm.launcherFor("web_two").launch(TEMPLATE);
      expect(first.sandboxId).not.toBe(second.sandboxId);
      expect(first.surface).toBe("container");
      await first.close();
      await second.close();
      await warm.drain();
      expect(liveWarmContainers()).toEqual([]);
    },
    LAUNCH_MS,
  );
});
