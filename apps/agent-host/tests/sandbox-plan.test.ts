import {
  ContainerReaderBrowser,
  NativeReaderBrowser,
} from "@covenant/browser-drive";
import { describe, expect, it } from "vitest";

import {
  containerPlan,
  inProcessPlan,
  resolvePlan,
} from "../src/browser/sandbox-plan.js";
import { RecordingLogger } from "./support/fakes.js";

/**
 * One plan decides both browsers this host opens: the window the shopper
 * watches and the reader the research errand batches through. They cannot
 * disagree — a container window beside a headless Chrome on the host would put
 * a browser on the machine the container exists to keep clean.
 */
describe("the sandbox plan", () => {
  it("reads on this host when the window is on this host", () => {
    expect(inProcessPlan("asked for").readerBrowser()).toBeInstanceOf(
      NativeReaderBrowser,
    );
  });

  it("reads in a container when the window is in a container", () => {
    expect(containerPlan("Docker is here").readerBrowser()).toBeInstanceOf(
      ContainerReaderBrowser,
    );
  });

  it("names the surface of both browsers once, at boot", async () => {
    const logger = new RecordingLogger();
    const plan = await resolvePlan(
      { COVENANT_BROWSER_SANDBOX: "in-process" },
      logger,
    );
    expect(plan.surface).toBe("native-window");
    expect(plan.readerBrowser()).toBeInstanceOf(NativeReaderBrowser);
    const said = logger.lines.filter((line) => line.evt === "browser.surface");
    expect(said).toHaveLength(1);
    expect(said[0]?.fields).toMatchObject({
      window: "native-window",
      reader: "native-window",
    });
  });
});
