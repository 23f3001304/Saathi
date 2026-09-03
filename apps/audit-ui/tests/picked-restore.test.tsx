// The pick is the host's fact, replayed like the cart. It used to be `useState`
// in ChatSession alone: the founder tapped an open-web card, walked to the
// Windows tab and came back to "Pick one below" with Cheaper / Better rated /
// None of these, over an errand that was already running in the window.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { mount, resetAuthEnvironment } from "./support/authHarness.tsx";

import { parseBeat, type AgentBeat } from "../src/api/agentBeat.ts";
import { signalsForBeats } from "../src/conversation/beatSignals.ts";
import { reduceSignals } from "../src/conversation/assistantState.ts";
import type {
  AssistantSignal,
  Emit,
} from "../src/conversation/assistantTransport.ts";

const held = vi.hoisted(() => ({ signals: [] as AssistantSignal[] }));

// One frozen transport, as `useAssistantTransport`'s own `useMemo` gives: a
// fresh object per render would restart the run on every render.
vi.mock("../src/conversation/useAssistantTransport.ts", () => {
  const transport = {
    live: true,
    start: (emit: Emit) => {
      for (const signal of held.signals) emit(signal);
      return () => undefined;
    },
    send: () => undefined,
    sign: () => Promise.resolve(true),
  };
  return { useAssistantTransport: () => transport };
});

const { ChatSession } = await import("../src/conversation/ChatSession.tsx");

const WEB_ROW = {
  id: "w1",
  sku: "w1",
  title: "Crucial E100 1TB, USB-C portable SSD",
  pricePaise: 619_900,
  rating: 0,
  deliveryDays: 0,
  merchant: "amazon.in",
  quoteSigned: false,
  sourceUrl: "https://www.amazon.in/dp/B0D1XYZ123",
};

const OFFER: AgentBeat = { offsetMs: 10, kind: "options", options: [WEB_ROW] };
const PICKED: AgentBeat = { offsetMs: 20, kind: "picked", ref: "w1" };
const WINDOW: AgentBeat = {
  offsetMs: 30,
  kind: "sandbox",
  session: {
    id: "web_1",
    sandbox: { surface: "container", id: "cnt_1" },
    merchant: "amazon.in",
    url: "https://www.amazon.in/dp/B0D1XYZ123",
    title: "amazon.in",
    state: "agent-drive",
    handoff: null,
    actions: [],
  },
};

describe("the picked beat on the wire", () => {
  it("is admitted by the parser rather than dropped as unknown", () => {
    expect(parseBeat({ offsetMs: 20, kind: "picked", ref: "w1" })).toEqual({
      offsetMs: 20,
      kind: "picked",
      ref: "w1",
    });
  });

  it("still refuses a kind this build does not know", () => {
    expect(parseBeat({ offsetMs: 1, kind: "haggled", ref: "w1" })).toBeNull();
  });
});

describe("the snapshot remembers the choice", () => {
  it("holds the ref the host says was picked", () => {
    const state = reduceSignals(signalsForBeats([OFFER, PICKED]));
    expect(state.picked).toBe("w1");
    expect(state.options.map((row) => row.id)).toEqual(["w1"]);
  });

  it("starts with nothing picked", () => {
    expect(reduceSignals(signalsForBeats([OFFER])).picked).toBeNull();
  });

  it("clears the choice when a fresh set supersedes it", () => {
    const again: AgentBeat = { offsetMs: 40, kind: "options", options: [] };
    const state = reduceSignals(signalsForBeats([OFFER, PICKED, again]));
    expect(state.picked).toBeNull();
  });
});

/** The empty-chat opener strip reads the signed-in profile, so the tree needs
 *  an `AuthProvider` over it even though this suite signs nobody in. */
function chatWith(beats: readonly AgentBeat[]): void {
  held.signals = signalsForBeats(beats);
  mount(
    <ChatSession
      offline={false}
      conversationId="cnv_shoes"
      onTitle={() => undefined}
      onStatus={() => undefined}
      visible
    />,
  );
}

describe("coming back to a chat whose card was already chosen", () => {
  beforeEach(() => {
    resetAuthEnvironment();
    // jsdom lays nothing out, so it implements no scrolling at all.
    Element.prototype.scrollIntoView = () => undefined;
  });

  it("offers the way out of the choice, not the menu again", () => {
    chatWith([OFFER, PICKED, WINDOW]);

    expect(screen.getByRole("button", { name: "Switch product" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cheaper" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Better rated" })).toBeNull();
    expect(screen.queryByRole("button", { name: "None of these" })).toBeNull();
  });

  it("still opens the menu when nothing has been picked", () => {
    chatWith([OFFER]);

    expect(screen.getByRole("button", { name: "Cheaper" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch product" })).toBeNull();
  });
});
