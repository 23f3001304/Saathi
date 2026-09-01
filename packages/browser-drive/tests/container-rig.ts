import { CartCovenant } from "../src/cart/cart-covenant.js";
import { CartInspector } from "../src/cart/cart-inspector.js";
import { ContainerLauncher } from "../src/container/container-launcher.js";
import { seccompProfilePath } from "../src/container/profile-path.js";
import { NavigationPolicy } from "../src/drive/navigation-policy.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import { DEFAULT_HANDOFF_CONFIG } from "../src/handoff/handoff-controller.js";
import { CollectingJournalSink, Journal } from "../src/journal.js";
import { BrowserSession } from "../src/session/browser-session.js";
import { TmpSandboxFactory } from "../src/session/sandbox.js";
import { TimerWaiter } from "../src/session/waiter.js";
import { FixedClock } from "./fakes.js";

export const IMAGE = "covenant-browser-sandbox:latest";
export const LAUNCH_MS = 90_000;
export const SESSION_ID = "web_ctrtest";
export const MEMORY_MB = 1024;
export const WINDOW = { width: 900, height: 700 } as const;

/**
 * The same wiring the host uses, with the container launcher in place of the
 * in-process one. Only the launcher and the file root differ: the classifier,
 * the redactor and the state machine are the shipping ones, so a guard that
 * holds here is the guard that holds in a real session.
 */
export function buildContainerSession(): BrowserSession {
  return new BrowserSession({
    launcher: new ContainerLauncher({
      image: IMAGE,
      seccompProfile: seccompProfilePath(),
      memoryMb: MEMORY_MB,
      ttlSeconds: 300,
      sessionId: SESSION_ID,
    }),
    sandboxes: new TmpSandboxFactory(),
    classifier: new FieldClassifier(),
    policy: new NavigationPolicy({
      // The shop baked into the image, not a directory on this machine.
      fileRoots: ["/opt/covenant/fixtures/shop"],
      allowHosts: [],
      denyHosts: [],
    }),
    inspector: new CartInspector(),
    covenant: new CartCovenant({ capPaise: 150_000, currency: "INR" }),
    journal: new Journal(
      new CollectingJournalSink(),
      new FixedClock(),
      SESSION_ID,
    ),
    waiter: new TimerWaiter(),
    clock: new FixedClock(),
    config: {
      sessionId: SESSION_ID,
      surface: "container",
      windowWidth: WINDOW.width,
      windowHeight: WINDOW.height,
      handoff: { ...DEFAULT_HANDOFF_CONFIG, pollIntervalMs: 50, maxPolls: 2 },
    },
  });
}
