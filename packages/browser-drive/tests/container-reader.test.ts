import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { HeadlessReader } from "../src/chrome/headless-reader.js";
import {
  ContainerReaderBrowser,
  READER_CHROME_ARGS,
  readerLaunchRequest,
  readSessionId,
} from "../src/container/container-reader.js";
import { specOf } from "../src/container/container-spec.js";
import { dockerSandboxReady } from "../src/container/docker-cli.js";
import { seccompProfilePath } from "../src/container/profile-path.js";
import {
  containerChromeArgs,
  containerRunArgs,
} from "../src/container/run-args.js";
import { NavigationPolicy } from "../src/drive/navigation-policy.js";
import { CONTAINER_FIXTURE_DIR, fixtureShopUrl } from "../src/fixtures.js";
import { IMAGE, LAUNCH_MS, MEMORY_MB } from "./container-rig.js";

const SKIP_REASON = await dockerSandboxReady(IMAGE);
if (SKIP_REASON !== null) {
  console.warn(`[browser-drive] container reader SKIPPED: ${SKIP_REASON}`);
}

const READER_CONFIG = {
  image: IMAGE,
  seccompProfile: seccompProfilePath(),
  memoryMb: MEMORY_MB,
  ttlSeconds: 300,
} as const;

function containerReader(image: string = IMAGE): HeadlessReader {
  const policy = new NavigationPolicy({
    // The shop baked into the image, not a directory on this machine.
    fileRoots: [CONTAINER_FIXTURE_DIR],
    allowHosts: [],
    denyHosts: [],
  });
  return new HeadlessReader(
    policy,
    new ContainerReaderBrowser({ ...READER_CONFIG, image }),
  );
}

/** Every reader container still running, by name. Empty is the only pass. */
function liveReaderContainers(): readonly string[] {
  const listed = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    stdio: "pipe",
  })
    .toString()
    .trim();
  return listed === ""
    ? []
    : listed.split(/\r?\n/).filter((name) => name.includes("read_"));
}

describe("the reader's own container", () => {
  it("is a throwaway, named for a read and never for a session", () => {
    const first = readSessionId();
    expect(first).toMatch(/^read_[0-9a-f]{12}$/);
    expect(readSessionId()).not.toBe(first);
  });

  /**
   * The reader's container is the shopper's container with two differences and
   * no third: it answers to its own name, and it does not decode pictures. Any
   * other divergence would mean the research surface is locked down on terms of
   * its own, which is exactly the drift this asserts against.
   */
  it("runs under the same lockdown as the shopper's window", () => {
    const request = readerLaunchRequest();
    const reader = containerRunArgs(
      specOf({ ...READER_CONFIG, sessionId: "read_abcdef012345" }),
      containerChromeArgs(request, READER_CHROME_ARGS),
    );
    const shopper = containerRunArgs(
      specOf({ ...READER_CONFIG, sessionId: "web_abcdef012345" }),
      containerChromeArgs(request),
    );
    expect(reader.filter((arg) => !shopper.includes(arg))).toEqual([
      "covenant-browse-read_abcdef012345",
      "covenant.session=read_abcdef012345",
      "covenant-browse-net-read_abcdef012345",
      "--blink-settings=imagesEnabled=false",
    ]);
  });
});

const container = describe.skipIf(SKIP_REASON !== null);

/**
 * Real Docker, real Chrome, the fixture shop baked into the image. With the
 * container surface chosen, research reads are the last thing that used to open
 * Chrome on the host; this proves they no longer do, and that the container
 * they open instead does not outlive the batch that opened it.
 */
container("research reads on the container surface", () => {
  it(
    "reads the fixture shop, twice, and leaves no container behind",
    async () => {
      const reader = containerReader();
      const shop = [fixtureShopUrl("index.html", "container")];
      const [first] = await reader.readMany(shop);
      expect(first?.failure).toBeNull();
      expect(first?.dom).not.toBeNull();
      expect(first?.text).toContain("Trailfoot");
      // The second batch is the one that would fail if the first container had
      // been left running, or its network left behind for the next name.
      const [second] = await reader.readMany(shop);
      expect(second?.failure).toBeNull();
      expect(second?.text).toContain("Trailfoot");
      expect(liveReaderContainers()).toEqual([]);
    },
    LAUNCH_MS,
  );

  it(
    "hands back a failed batch when its container will not start",
    async () => {
      const reader = containerReader("covenant-browser-sandbox:no-such-tag");
      const [read] = await reader.readMany([
        fixtureShopUrl("index.html", "container"),
      ]);
      expect(read?.dom).toBeNull();
      expect(read?.failure).not.toBeNull();
      expect(liveReaderContainers()).toEqual([]);
    },
    LAUNCH_MS,
  );
});
