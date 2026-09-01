import { describe, expect, it } from "vitest";

import { UserInput } from "../src/drive/user-input.js";
import { FieldClassifier } from "../src/field/field-classifier.js";
import type { ElementDescriptor } from "../src/field/element-descriptor.js";
import { CollectingJournalSink, Journal } from "../src/journal.js";
import type { JournalEvent } from "../src/journal.js";
import { SessionStateMachine } from "../src/session-state.js";
import { FakePage } from "./fake-page.js";
import { el, FixedClock } from "./fakes.js";

import {
  CARD,
  CHECKOUT,
  PASSWORD,
  PRODUCT,
  QUANTITY,
  SIZE_SELECTOR,
} from "./relay-fixtures.js";

interface Rig {
  readonly input: UserInput;
  readonly page: FakePage;
  readonly journal: Journal;
  readonly state: SessionStateMachine;
}

function rig(options: {
  url: string;
  points?: Readonly<Record<string, ElementDescriptor>>;
  focused?: ElementDescriptor | null;
  drive?: "agent" | "user";
  /** The container surface's relay policy; the native surface's is the default. */
  carriesSensitive?: boolean;
}): Rig {
  const state = new SessionStateMachine();
  const journal = new Journal(
    new CollectingJournalSink(),
    new FixedClock(),
    "sess_relay",
  );
  const page = new FakePage({
    url: options.url,
    points: options.points ?? {},
    focused: options.focused ?? null,
  });
  state.transition("agent-drive");
  if (options.drive !== "agent") {
    state.transition("user-drive");
  }
  return {
    state,
    page,
    journal,
    input: new UserInput(page, new FieldClassifier(), state, journal, {
      carriesSensitive: options.carriesSensitive ?? false,
    }),
  };
}

function lastEvent(journal: Journal): JournalEvent | undefined {
  return journal.entries().at(-1);
}

describe("a relayed click while the user drives", () => {
  it("goes through for an ordinary control, journalled as the user's", async () => {
    const test = rig({
      url: PRODUCT,
      points: { "140,220": SIZE_SELECTOR, "140,300": QUANTITY },
    });
    expect((await test.input.click(140, 220)).ok).toBe(true);
    expect((await test.input.click(140, 300)).ok).toBe(true);
    expect(test.page.relayed).toEqual([
      { action: "click", detail: "140,220" },
      { action: "click", detail: "140,300" },
    ]);
    const events = test.journal.entries();
    expect(events.map((e) => e.kind)).toEqual(["page.clicked", "page.clicked"]);
    expect(events.every((e) => e.actor === "user")).toBe(true);
  });

  it("refuses a card field and sends nothing to the window", async () => {
    const test = rig({ url: CHECKOUT, points: { "300,180": CARD } });
    const result = await test.input.click(300, 180);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe("card");
    expect(result.human).toContain("card data");
    expect(test.page.relayed).toEqual([]);
    expect(lastEvent(test.journal)).toMatchObject({
      kind: "action.blocked",
      actor: "user",
      detail: { action: "click", rule: "card_autocomplete" },
    });
  });
});

describe("a relayed click at an unreadable target", () => {
  it("is refused rather than guessed at", async () => {
    const test = rig({ url: PRODUCT });
    const result = await test.input.click(9000, 9000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("relay_target_unreadable");
    expect(test.page.relayed).toEqual([]);
  });
});

describe("relayed typing", () => {
  it("refuses when the focused element is a password box", async () => {
    const test = rig({ url: PRODUCT, focused: PASSWORD });
    const result = await test.input.type("hunter2");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe("password");
    expect(test.page.relayed).toEqual([]);
    // The block is recorded with the length only — never the characters.
    expect(lastEvent(test.journal)?.detail["chars"]).toBe(7);
    expect(JSON.stringify(test.journal.entries())).not.toContain("hunter2");
  });

  it("refuses a keypress into a password box as well", async () => {
    const test = rig({ url: PRODUCT, focused: PASSWORD });
    expect((await test.input.key("Enter")).ok).toBe(false);
    expect(test.page.relayed).toEqual([]);
  });

  it("carries ordinary text through and records only its length", async () => {
    const test = rig({ url: PRODUCT, focused: SIZE_SELECTOR });
    expect((await test.input.type("UK 9")).ok).toBe(true);
    expect(test.page.relayed).toEqual([{ action: "type", detail: "UK 9" }]);
    const event = lastEvent(test.journal);
    expect(event).toMatchObject({ kind: "page.typed", actor: "user" });
    expect(JSON.stringify(event)).not.toContain("UK 9");
  });
});

describe("relayed typing with no field waiting for it", () => {
  it("is refused when nothing is focused at all", async () => {
    const test = rig({ url: PRODUCT, focused: null });
    const result = await test.input.type("x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("relay_target_unreadable");
  });

  it("refuses when focus is on something that takes no text", async () => {
    const test = rig({
      url: PRODUCT,
      focused: el({ tag: "body", inputType: null, pageUrl: PRODUCT }),
    });
    const result = await test.input.type("x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("relay_no_text_target");
    expect(test.page.relayed).toEqual([]);
  });
});

describe("scrolling", () => {
  it("is always allowed while the user drives — looking is not acting", async () => {
    const test = rig({ url: CHECKOUT });
    expect((await test.input.scroll(240)).ok).toBe(true);
    expect(lastEvent(test.journal)).toMatchObject({
      kind: "page.scrolled",
      actor: "user",
    });
  });
});

describe("a relay that arrives while the agent is driving", () => {
  it("throws, because that is a wiring bug and not a refusal", async () => {
    const test = rig({
      url: PRODUCT,
      drive: "agent",
      points: { "140,220": SIZE_SELECTOR },
      focused: SIZE_SELECTOR,
    });
    await expect(test.input.click(140, 220)).rejects.toThrow(
      /RelayViolation|relayed/,
    );
    await expect(test.input.type("UK 9")).rejects.toThrow(/only accepted/);
    await expect(test.input.key("Enter")).rejects.toThrow(/only accepted/);
    await expect(test.input.scroll(10)).rejects.toThrow(/only accepted/);
    expect(test.page.relayed).toEqual([]);
    expect(test.journal.entries()).toEqual([]);
  });
});
