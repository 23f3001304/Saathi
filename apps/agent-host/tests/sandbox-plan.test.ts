import {
  ContainerLauncher,
  ContainerReaderBrowser,
} from "@covenant/browser-drive";
import { describe, expect, it } from "vitest";

import { containerPlan, resolvePlan } from "../src/browser/sandbox-plan.js";
import { RecordingLogger } from "./support/fakes.js";

/**
 * One plan decides both browsers this host opens: the window the shopper
 * watches and the reader the research errand batches through. They cannot
 * disagree — a container window beside a headless Chrome on the host would put
 * a browser on the machine the container exists to keep clean.
 */
describe("the sandbox plan", () => {
  it("reads in a container when the window is in a container", () => {
    expect(containerPlan("Docker is here").readerBrowser()).toBeInstanceOf(
      ContainerReaderBrowser,
    );
  });

  it("resolves to a container, or refuses; never to this machine", async () => {
    const logger = new RecordingLogger();
    // No env can ask for the host's own Chrome any more. With Docker and the
    // image present this resolves to a container; anywhere else it throws
    // saying so. What it must never do is quietly run a browser here.
    const plan = await resolvePlan(
      { COVENANT_BROWSER_SANDBOX: "in-process" },
      logger,
    ).catch((error: unknown) => error as Error);
    if (plan instanceof Error) {
      expect(plan.message).toMatch(/container/i);
      return;
    }
    expect(plan.surface).toBe("container");
    await plan.drainWarm();
  });

  it("keeps nothing warm unless it is asked to", () => {
    const plan = containerPlan("Docker is here");
    expect(plan.readerBrowser()).toBeInstanceOf(ContainerReaderBrowser);
    expect(plan.launcherFor("web_x")).toBeInstanceOf(ContainerLauncher);
  });

  /** A warm pool changes *when* a container starts, never what a caller gets:
   *  a research batch still reads through a container of its own and a window
   *  still launches into one. Both surfaces come from the pool here, so the
   *  assertion is that they are no longer the cold classes. */
  it("serves both browsers from the pool once it is", () => {
    const plan = containerPlan("Docker is here", { readers: 1, windows: 1 });
    expect(plan.readerBrowser()).not.toBeInstanceOf(ContainerReaderBrowser);
    expect(plan.launcherFor("web_x")).not.toBeInstanceOf(ContainerLauncher);
  });
});
