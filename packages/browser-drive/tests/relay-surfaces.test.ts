import { describe, expect, it } from "vitest";

import { UserInput } from "../src/drive/user-input.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import { Journal, CollectingJournalSink } from "../src/journal.js";
import { SessionStateMachine } from "../src/session-state.js";
import { relayPolicyFor } from "../src/surface.js";
import type { SessionSurface } from "../src/surface.js";
import { el, FakePage, FixedClock } from "./fakes.js";

const LOGIN = "https://bazaar.example/account/signin";

const PASSWORD = el({
  selector: "#password",
  id: "password",
  inputType: "password",
  name: "password",
  pageUrl: LOGIN,
});

function rig(surface: SessionSurface) {
  const state = new SessionStateMachine();
  const journal = new Journal(
    new CollectingJournalSink(),
    new FixedClock(),
    "s",
  );
  const page = new FakePage({ url: LOGIN, focused: PASSWORD });
  state.transition("agent-drive");
  state.transition("user-drive");
  const input = new UserInput(
    page,
    new FieldClassifier(),
    state,
    journal,
    relayPolicyFor(surface),
  );
  return { page, journal, input };
}

/**
 * The two surfaces, side by side, on the one case that separates them.
 *
 * With a window on the user's desktop the relay refuses and points at it: the
 * keystrokes provably never traverse this process. In a container there is no
 * such window, so refusing would not protect the password — it would only push
 * the user somewhere with no covenant on it. The relay carries it, and pays for
 * that in what it is allowed to remember.
 */
describe("a password typed through the relay", () => {
  it("is refused where the user has a window of their own", async () => {
    const { page, input } = rig("native-window");
    const result = await input.type("hunter2");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe("password");
    expect(page.relayed).toEqual([]);
  });

  it("is carried in a container, because it is the only hand there is", async () => {
    const { page, input } = rig("container");
    const result = await input.type("hunter2");
    expect(result.ok).toBe(true);
    expect(page.relayed).toEqual([{ action: "type", detail: "hunter2" }]);
  });

  it("leaves a line saying it happened and nothing about what it was", async () => {
    const { journal, input } = rig("container");
    await input.type("hunter2");
    const event = journal.entries().at(-1);
    expect(event?.kind).toBe("page.typed");
    expect(event?.actor).toBe("user");
    expect(event?.detail).toEqual({ protected: true, relayed: true });
    // The two ways a length leaks: named outright, or as the only number here.
    expect(Object.keys(event?.detail ?? {})).not.toContain("chars");
    expect(JSON.stringify(journal.entries())).not.toContain("hunter2");
  });
});

describe("an ordinary field typed through the relay", () => {
  it("still records the length", async () => {
    const { page, journal, input } = rig("container");
    // A shop page, not the sign-in one: inside a login scope the classifier
    // protects the whole form, search box included, and rightly so.
    page.setFocus(
      el({
        selector: "#q",
        id: "q",
        inputType: "search",
        name: "q",
        pageUrl: "https://bazaar.example/products/trailfoot-runner",
      }),
    );
    await input.type("trail shoes");
    expect(journal.entries().at(-1)?.detail).toMatchObject({ chars: 11 });
  });
});

describe("what does not change with the surface", () => {
  it("refuses a target it cannot read, on both", async () => {
    for (const surface of ["native-window", "container"] as const) {
      const { input, page } = rig(surface);
      page.setFocus(null);
      const result = await input.type("anything");
      expect(result.ok).toBe(false);
      expect(page.relayed).toEqual([]);
    }
  });

  it("refuses an embedded frame, on both", async () => {
    for (const surface of ["native-window", "container"] as const) {
      const { input, page } = rig(surface);
      page.setFocus(el({ tag: "iframe", selector: "iframe", pageUrl: LOGIN }));
      const result = await input.type("anything");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rule).toBe("relay_target_opaque");
      expect(page.relayed).toEqual([]);
    }
  });
});
