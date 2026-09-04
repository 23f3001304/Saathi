import { ContainerReaderBrowser } from "@covenant/browser-drive";
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

  it("refuses to run without a container, rather than downgrading", async () => {
    const logger = new RecordingLogger();
    // No env can ask for the host's own Chrome any more: a purchase window
    // is a container or it does not open. On a machine with Docker and the
    // image built this resolves; anywhere else it throws, saying so.
    await expect(
      resolvePlan({ COVENANT_BROWSER_SANDBOX: "in-process" }, logger),
    ).rejects.toThrow(/container/i);
  });
});
