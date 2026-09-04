import { PuppeteerLauncher, TmpSandboxFactory } from "@covenant/browser-drive";

import { resolvePlan } from "../../src/browser/sandbox-plan.js";
import { SilentLogger } from "./fakes.js";

/** Is there a real Chrome on this machine to drive at all? */
export async function probeChrome(): Promise<string | null> {
  const sandbox = new TmpSandboxFactory().create(`web-tools-${process.pid}`);
  try {
    const browser = await new PuppeteerLauncher().launch({
      userDataDir: sandbox.path,
      downloadDir: sandbox.downloadDir,
      surface: "native-window",
      windowWidth: 900,
      windowHeight: 700,
    });
    await browser.close();
    return null;
  } catch (error) {
    return String(error).slice(0, 200);
  } finally {
    sandbox.dispose();
  }
}

/**
 * The real-Chrome suites drive fixture pages served from this machine over
 * `file://`, and a container mounts nothing from the host by design
 * (`FORBIDDEN_CONTAINER_ARGS`) - so on the container surface those pages are
 * unreachable and the suite cannot mean anything. It skips there, loudly,
 * rather than failing: the tool surface it covers is exercised by
 * `web-tools.test.ts` against a fake page, and what is lost is the real-Chrome
 * half of that coverage. Serving the fixtures over HTTP into the container's
 * bridge is the way back to it.
 */
export async function probeSandbox(): Promise<string | null> {
  try {
    const plan = await resolvePlan(process.env, new SilentLogger());
    return plan.surface === "container"
      ? "the sandbox is a container and file:// fixtures live on this host"
      : null;
  } catch (error) {
    return String(error).slice(0, 200);
  }
}

/** Why this suite cannot run here, or `null` when it can. */
export async function chromeSuiteSkip(label: string): Promise<string | null> {
  const why = (await probeChrome()) ?? (await probeSandbox());
  if (why !== null) console.warn(`[agent-host] ${label} SKIPPED: ${why}`);
  return why;
}
