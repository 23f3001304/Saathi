// The pick is the host's fact, replayed like the cart. It used to be `useState`
// in ChatSession alone: the founder tapped an open-web card, walked to the
// Windows tab and came back to "Pick one below" with Cheaper / Better rated /
// None of these, over an errand that was already running in the window.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";

import { mount, resetAuthEnvironment } from "./support/authHarness.tsx";

import { parseBeat, type AgentBeat } from "../src/api/agentBeat.ts";
import { signalsForBeats } from "../src/conversation/beatSignals.ts";
import { reduceSignals } from "../src/conversation/assistantState.ts";
import type {
  AssistantSignal,
  Emit,
} from "../src/conversation/assistantTransport.ts";

const held = vi.hoisted(() => ({
  signals: [] as AssistantSignal[],
  /** Kept so a test can land a later beat, a run after the first drain. */
  emit: null as Emit | null,
  /** Every ref this screen actually sent to the host. */
  picks: [] as string[],
}));

// One frozen transport, as `useAssistantTransport`'s own `useMemo` gives: a
// fresh object per render would restart the run on every render.
vi.mock("../src/conversation/useAssistantTransport.ts", () => {
  const transport = {
    live: true,
    start: (emit: Emit) => {
      held.emit = emit;
      for (const signal of held.signals) emit(signal);
      return () => undefined;
    },
    send: () => undefined,
    sign: () => Promise.resolve(true),
  };
  return { useAssistantTransport: () => transport };
});

vi.mock("../src/api/agent.ts", async (original) => ({
  ...(await original<typeof import("../src/api/agent.ts")>()),
  pickWebOption: (optionId: string) => {
    held.picks.push(optionId);
    return Promise.resolve(true);
  },
}));

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

const SECOND_ROW = { ...WEB_ROW, id: "w2", sku: "w2", title: "SanDisk Extreme 1TB" };

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

/** A beat that lands after the first drain, as a live run's next one does. */
function later(beats: readonly AgentBeat[]): void {
  act(() => {
    for (const signal of signalsForBeats(beats, 100)) held.emit?.(signal);
  });
}

function readyToRender(): void {
  resetAuthEnvironment();
  held.picks = [];
  // jsdom lays nothing out, so it implements no scrolling at all.
  Element.prototype.scrollIntoView = () => undefined;
}

describe("coming back to a chat whose card was already chosen", () => {
  beforeEach(readyToRender);

  it("offers the way out of the choice, not the menu again", () => {
    chatWith([OFFER, PICKED, WINDOW]);

    expect(screen.getByRole("button", { name: "Switch product" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cheaper" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Better rated" })).toBeNull();
    expect(screen.queryByRole("button", { name: "None of these" })).toBeNull();
  });

  // The founder's own path: the Windows tab and back while the errand is still
  // driving. The host now writes the window's beat when it opens rather than
  // when the run settles, so this transcript exists mid-errand at all.
  it("shows the errand under way instead of the cards, mid-errand", () => {
    chatWith([OFFER, PICKED, WINDOW]);

    expect(screen.getByRole("button", { name: "Switch product" })).toBeTruthy();
    expect(screen.getByText(/Going for/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Crucial E100/ })).toBeNull();
  });

  it("still opens the menu when nothing has been picked", () => {
    chatWith([OFFER]);

    expect(screen.getByRole("button", { name: "Cheaper" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch product" })).toBeNull();
  });
});

/**
 * The launch is its own gesture, and switching away then back is the shopper
 * changing their mind twice. Reading "the host says w1 and the screen says w1"
 * as a restore cannot tell that apart from a re-tap, and it left the dock
 * showing "Switch product" over an errand nobody had asked for again.
 */
describe("re-choosing the same card after switching away from it", () => {
  beforeEach(readyToRender);

  it("offers the launch again rather than assuming it is under way", () => {
    chatWith([OFFER, PICKED, WINDOW]);
    fireEvent.click(screen.getByRole("button", { name: "Switch product" }));
    fireEvent.click(screen.getByRole("button", { name: /Crucial E100/ }));

    expect(screen.getByRole("button", { name: "Go to the shop" })).toBeTruthy();
    expect(screen.getByText(/Go and put it in that shop's basket\?/)).toBeTruthy();
    // The tap chose; it did not send anybody to a shop.
    expect(held.picks).toEqual([]);
  });
});

describe("a fresh set of cards after a launched errand", () => {
  beforeEach(readyToRender);

  it("brings the refinements back with them", () => {
    chatWith([OFFER, PICKED, WINDOW]);
    expect(screen.getByRole("button", { name: "Switch product" })).toBeTruthy();

    later([{ offsetMs: 90, kind: "options", options: [SECOND_ROW] }]);

    expect(screen.getByRole("button", { name: "Cheaper" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch product" })).toBeNull();
  });
});

/**
 * The host names the card at the *start* of the errand now, which is the same
 * card the hand just launched. Reading any change as "the host has moved on"
 * threw the launch away mid-errand: the cards unfolded, the dock re-asked for
 * a shop it was already standing in, and a second press queued a duplicate run.
 */
describe("the host echoing the launch the hand just made", () => {
  beforeEach(readyToRender);

  it("leaves the errand alone rather than asking to start it again", () => {
    chatWith([OFFER]);
    fireEvent.click(screen.getByRole("button", { name: /Crucial E100/ }));
    fireEvent.click(screen.getByRole("button", { name: "Go to the shop" }));
    expect(screen.getByRole("button", { name: "Switch product" })).toBeTruthy();

    // What the host says as the errand begins. The window's own beat does not
    // follow until it is open, and once did not follow until the run settled.
    later([PICKED]);

    expect(screen.getByRole("button", { name: "Switch product" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go to the shop" })).toBeNull();
    expect(held.picks).toEqual(["w1"]);
  });
});
