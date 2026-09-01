import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dockerSandboxReady } from "../src/container/docker-cli.js";
import type { GuardedPage } from "../src/drive/guarded-page.js";
import { fixtureShopUrl } from "../src/fixtures.js";
import type { BrowserSession } from "../src/session/browser-session.js";
import {
  buildContainerSession,
  IMAGE,
  LAUNCH_MS,
  MEMORY_MB,
  SESSION_ID,
  WINDOW,
} from "./container-rig.js";

const SKIP_REASON = await dockerSandboxReady(IMAGE);
if (SKIP_REASON !== null) {
  console.warn(`[browser-drive] container suite SKIPPED: ${SKIP_REASON}`);
}

function inspect(name: string, format: string): string {
  return execFileSync("docker", ["inspect", "--format", format, name], {
    // The teardown case asserts this throws; its complaint is expected output,
    // not a failure, so it is not printed alongside the passing suite.
    stdio: "pipe",
  })
    .toString()
    .trim();
}

let session: BrowserSession;
let page: GuardedPage;

beforeAll(async () => {
  if (SKIP_REASON !== null) return;
  session = buildContainerSession();
  page = await session.launch();
}, LAUNCH_MS);

afterAll(async () => {
  if (SKIP_REASON !== null) return;
  await session.close();
}, LAUNCH_MS);

const container = describe.skipIf(SKIP_REASON !== null);

/**
 * Real Docker, real Chrome, the fixture shop baked into the image — never a
 * third-party site, so this suite is offline and deterministic. The suite skips
 * (loudly, with the reason) where Docker or the image is missing: that is a
 * capability this machine lacks, not a guard that failed.
 */
container("the containerised window", () => {
  it("reports the surface it is actually on", () => {
    expect(session.surface()).toBe("container");
    expect(session.sandboxId()).toBe(`covenant-browse-${SESSION_ID}`);
  });

  it("started Chrome with its own sandbox intact", () => {
    // The proof is that it started at all. Nothing here passes --no-sandbox,
    // and Chrome refuses to run without a usable one, so a broken seccomp
    // profile or a missing capability shows up as a launch failure above.
    expect(inspect(session.sandboxId(), "{{.State.Running}}")).toBe("true");
    const opts = inspect(
      session.sandboxId(),
      "{{json .HostConfig.SecurityOpt}}",
    );
    expect(opts).toContain("no-new-privileges");
    expect(opts).toContain("seccomp");
  });

  it("is bound to this session by label, not just by name", () => {
    const labels = inspect(session.sandboxId(), "{{json .Config.Labels}}");
    expect(labels).toContain(`"covenant.session":"${SESSION_ID}"`);
    expect(labels).toContain('"covenant.browser-sandbox":"true"');
  });
});

container("what that container is denied", () => {
  it("publishes no port and mounts nothing from the host", () => {
    expect(
      inspect(session.sandboxId(), "{{json .NetworkSettings.Ports}}"),
    ).toBe("{}");
    expect(inspect(session.sandboxId(), "{{json .HostConfig.Binds}}")).toBe(
      "null",
    );
  });

  it("runs as a non-root user on a read-only root", () => {
    expect(inspect(session.sandboxId(), "{{.Config.User}}")).toBe("1001:1001");
    expect(inspect(session.sandboxId(), "{{.HostConfig.ReadonlyRootfs}}")).toBe(
      "true",
    );
    expect(
      inspect(session.sandboxId(), "{{json .HostConfig.CapDrop}}"),
    ).toContain("ALL");
  });

  it("has a memory ceiling and a network of its own", () => {
    expect(inspect(session.sandboxId(), "{{.HostConfig.Memory}}")).toBe(
      String(MEMORY_MB * 1024 * 1024),
    );
    expect(
      inspect(session.sandboxId(), "{{json .NetworkSettings.Networks}}"),
    ).toContain(`covenant-browse-net-${SESSION_ID}`);
  });
});

container("driving it", () => {
  it("opens the fixture shop that ships inside the image", async () => {
    const landed = await page.navigate(
      fixtureShopUrl("index.html", "container"),
    );
    expect(landed.ok).toBe(true);
    expect(session.url()).toContain("/opt/covenant/fixtures/shop/index.html");
  });

  it("captures a real redacted frame of it", async () => {
    const capture = await session.screenshot();
    expect(capture.kind).toBe("frame");
    if (capture.kind !== "frame") return;
    expect(capture.frame.width).toBe(WINDOW.width);
    expect(capture.frame.bytes.length).toBeGreaterThan(1000);
  });

  it("still refuses to let the agent type a password", async () => {
    await page.navigate(fixtureShopUrl("login.html", "container"));
    const result = await page.type("#password", "hunter2");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe("password");
    expect(session.currentState()).toBe("user-drive");
  });
});

/** The containerised relay against real Chrome, with the shutter rule as it
 *  now stands (reasoning in frame-capture.ts): nothing about the typing is
 *  written down, and the person doing it can see the field. */
container("while the shopper is in a password box", () => {
  it("focuses it through the relay, as the user's own hand", async () => {
    const fields = await session.fields();
    const box = fields.find((field) => field.descriptor.id === "password");
    expect(box).toBeDefined();
    if (box === undefined) return;
    const result = await session
      .input()
      .click(box.rect.x + box.rect.width / 2, box.rect.y + box.rect.height / 2);
    expect(result.ok).toBe(true);
  });

  it("keeps showing the shopper the field they are filling in", async () => {
    expect(session.currentState()).toBe("user-drive");
    expect((await session.screenshot()).kind).toBe("frame");
  });

  it("carries the keystrokes and remembers none of them", async () => {
    const result = await session.input().type("hunter2");
    expect(result.ok).toBe(true);
    const typed = session
      .journalEntries()
      .filter((event) => event.kind === "page.typed");
    expect(typed.at(-1)?.detail).toEqual({ protected: true, relayed: true });
    expect(JSON.stringify(session.journalEntries())).not.toContain("hunter2");
  });
});

/** The wheel goes back, the paint goes back on, the picture never stops. */
container("once the agent has the wheel back", () => {
  it("paints the field again rather than stopping the picture", async () => {
    session.handoff().resume();
    const capture = await session.screenshot();
    expect(capture.kind).toBe("frame");
    if (capture.kind === "frame")
      expect(capture.frame.redacted).toBeGreaterThan(0);
    await page.navigate(fixtureShopUrl("index.html", "container"));
    expect((await session.screenshot()).kind).toBe("frame");
  });
});

container("when the session ends", () => {
  it(
    "takes the container and its network with it",
    async () => {
      const name = session.sandboxId();
      await session.close();
      expect(() => inspect(name, "{{.Id}}")).toThrow();
      expect(() =>
        execFileSync(
          "docker",
          ["network", "inspect", `covenant-browse-net-${SESSION_ID}`],
          {
            stdio: "pipe",
          },
        ),
      ).toThrow();
    },
    LAUNCH_MS,
  );
});
