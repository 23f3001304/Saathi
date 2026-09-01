// @vitest-environment jsdom
//
// The sandbox card's provenance. The reel wears the same shape as a live
// session — a URL bar, a driver chip, an action list — so nothing but an
// explicit label distinguishes them, and without one a shopper reads a shop
// the agent never opened. What is pinned here is that the label is present,
// that a canned card offers no driving surface, and that falling to the reel
// is not a one-way door.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SandboxSession } from "../src/api/agentBeat.ts";
import { BrowserSessionCard } from "../src/browser/BrowserSessionCard.tsx";
import { attach } from "../src/browser/browserFallback.ts";
import type { BrowserSinks } from "../src/browser/browserFallback.ts";
import { BROWSING, HANDOFF_LOGIN } from "../src/browser/browserFixture.ts";
import { handshake, Refused } from "../src/browser/browserKey.ts";
import {
  CLOSED_NOTICE,
  restoredCard,
  UNREACHABLE_NOTICE,
} from "../src/browser/restoredCard.ts";
import type { BrowserSessionView } from "../src/browser/browserSession.ts";
import type {
  BrowserEmit,
  BrowserSignal,
  BrowserTransport,
} from "../src/browser/browserTransport.ts";
import {
  SAMPLE_HOST_GONE,
  SAMPLE_NO_HOST,
} from "../src/browser/browserTransport.ts";

const SAMPLE = { label: "offline", human: SAMPLE_HOST_GONE };

const LIVE: BrowserSessionView = {
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=trail+shoes",
  title: "amazon.in/s",
  state: "agent-drive",
  actions: [{ id: "a1", label: "Opened amazon.in", outcome: "ok" }],
};

/** As the durable log left it: a window the run was still driving. */
const RESTORED: SandboxSession = {
  id: "web_1",
  sandbox: { surface: "native-window", id: "w1" },
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=ssd",
  title: "amazon.in/s",
  state: "agent-drive",
  handoff: null,
  actions: [{ id: "a1", label: "Opened amazon.in", outcome: "ok" }],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("a card the host did not fill in", () => {
  it("says so before it says anything else", () => {
    render(
      <BrowserSessionCard
        session={{ ...HANDOFF_LOGIN, sample: SAMPLE }}
        onResume={() => undefined}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "a scripted demo is standing in",
    );
    expect(screen.getByText("offline")).toBeTruthy();
  });

  it("claims no driver, because there is no window to drive", () => {
    render(
      <BrowserSessionCard
        session={{ ...HANDOFF_LOGIN, state: "user-drive", sample: SAMPLE }}
        onResume={() => undefined}
        onRelay={() => undefined}
      />,
    );
    expect(screen.getByText("nobody is driving")).toBeTruthy();
    expect(screen.queryByText("You are driving")).toBeNull();
    // No `application` role means nothing here invites a click at a window
    // that does not exist, and the outside-the-covenant warning stays quiet
    // because no purchase is reachable from a script.
    expect(screen.queryByRole("application")).toBeNull();
    expect(screen.queryByText(/not through Saathi/i)).toBeNull();
  });

  it("leaves a live card entirely unlabelled", () => {
    render(<BrowserSessionCard session={LIVE} onResume={() => undefined} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Saathi is driving")).toBeTruthy();
  });
});

/**
 * A restored card carried the notice "That window is closed" and a "Saathi is
 * driving" chip at the same time. Whatever else is true, both cannot be.
 */
describe("a card with no window behind it", () => {
  it("claims no driver once the window is closed", () => {
    render(
      <BrowserSessionCard
        session={{ ...LIVE, state: "closed", notice: CLOSED_NOTICE }}
        onResume={() => undefined}
      />,
    );
    expect(screen.getByText("nobody is driving")).toBeTruthy();
    expect(screen.queryByText("Saathi is driving")).toBeNull();
  });

  it("claims no driver on a window it cannot reach either", () => {
    render(
      <BrowserSessionCard
        session={restoredCard(RESTORED) as BrowserSessionView}
        onResume={() => undefined}
      />,
    );
    expect(screen.getByText("nobody is driving")).toBeTruthy();
  });
});

/**
 * The live view being absent is a failure to attach, not a closed window. The
 * host was answering `/browser/state` with `agent-drive` on a real amazon.in
 * URL while the card said the window was closed.
 */
describe("a restored card tells which fact it knows", () => {
  it("says the window cannot be reached when the run left it open", () => {
    const card = restoredCard(RESTORED);
    expect(card?.notice).toBe(UNREACHABLE_NOTICE);
    expect(card?.notice).not.toContain("is closed");
    expect(card?.state).toBe("unreachable");
  });

  it("still says closed when that is what the log says", () => {
    const card = restoredCard({ ...RESTORED, state: "closed" });
    expect(card?.notice).toBe(CLOSED_NOTICE);
    expect(card?.state).toBe("closed");
  });

  it("offers no driving surface either way", () => {
    for (const state of ["closed", "user-drive"] as const) {
      const { unmount } = render(
        <BrowserSessionCard
          session={restoredCard({ ...RESTORED, state }) as BrowserSessionView}
          onResume={() => undefined}
          onRelay={() => undefined}
        />,
      );
      expect(screen.queryByRole("application")).toBeNull();
      unmount();
    }
  });
});

/**
 * A host that is listening but has not finished wiring its routes is not a
 * host refusing this page. Conflating the two is what stranded the card:
 * `Refused` is terminal for the sandbox seam, and a restart is the case the
 * card is supposed to climb back out of.
 */
describe("classifying a handshake that did not carry a key", () => {
  function answering(status: number): void {
    vi.stubGlobal("fetch", async () => new Response("{}", { status }));
  }

  it("calls a 503 the host not being there, not a refusal", async () => {
    answering(503);
    await expect(handshake("http://host.invalid")).rejects.not.toBeInstanceOf(
      Refused,
    );
    vi.unstubAllGlobals();
  });

  it("still calls a 401 a refusal", async () => {
    answering(401);
    await expect(handshake("http://host.invalid")).rejects.toBeInstanceOf(
      Refused,
    );
    vi.unstubAllGlobals();
  });
});

describe("the reel's own action lines", () => {
  it("name themselves, so a quoted line cannot pass for a reading", () => {
    for (const action of BROWSING.actions) {
      expect(action.label.startsWith("Sample —")).toBe(true);
    }
    expect(JSON.stringify(BROWSING)).not.toContain("high confidence");
  });
});

type Scripted = {
  made: number;
  emit: BrowserEmit;
  make: () => BrowserTransport;
};

/** A transport whose every signal this test decides, one at a time. */
function scripted(): Scripted {
  const rig = {
    made: 0,
    emit: (() => undefined) as BrowserEmit,
    make: (): BrowserTransport => {
      rig.made += 1;
      return {
        live: true,
        start: (emit) => {
          rig.emit = emit;
          emit({ kind: "status", status: "connecting" });
          return () => undefined;
        },
        relay: () => Promise.resolve({ ok: true as const }),
        resume: () => Promise.resolve(),
        takeover: () => Promise.resolve(),
        front: () => Promise.resolve(false),
      };
    },
  };
  return rig;
}

function sinksOf(seen: BrowserSignal[]): BrowserSinks {
  return {
    setView: (view) => {
      seen.push({ kind: "session", view });
    },
    setFrame: () => undefined,
    setBlackout: () => undefined,
    setStatus: (status) => {
      seen.push({ kind: "status", status });
    },
  };
}

describe("falling to the reel", () => {
  it("climbs back to the live window when the host answers again", () => {
    vi.useFakeTimers();
    const seen: BrowserSignal[] = [];
    const rig = scripted();
    const slot = { current: null as BrowserTransport | null };
    const stop = attach(slot, rig.make, sinksOf(seen));

    rig.emit({ kind: "status", status: "offline" });
    expect(seen.at(-1)).toEqual({ kind: "status", status: "offline" });

    // The reel is playing and a second live transport has not been built yet.
    expect(rig.made).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(rig.made).toBe(2);

    // A retry that is still connecting must not lift the "offline" label.
    expect(seen.filter((s) => s.kind === "status").at(-1)).toEqual({
      kind: "status",
      status: "offline",
    });

    rig.emit({ kind: "status", status: "live" });
    expect(seen.filter((s) => s.kind === "status").at(-1)).toEqual({
      kind: "status",
      status: "live",
    });
    // The reel's last view is cleared rather than left under a "live" banner.
    expect(seen.filter((s) => s.kind === "session").at(-1)).toEqual({
      kind: "session",
      view: null,
    });
    stop();
  });

  it("keeps trying on a backoff rather than stranding the card", () => {
    vi.useFakeTimers();
    const rig = scripted();
    const slot = { current: null as BrowserTransport | null };
    const stop = attach(slot, rig.make, sinksOf([]));

    for (const wait of [2_000, 5_000, 5_000]) {
      rig.emit({ kind: "status", status: "offline" });
      vi.advanceTimersByTime(wait);
    }
    expect(rig.made).toBe(4);
    stop();
  });

  /**
   * The banner promises the card comes back on its own. Measured against a
   * real host, it did not: the ladder spent 2/5/15/30s while the host was
   * down and then checked once every thirty seconds, so a host answering at
   * +27s reached the card at +56s. The ceiling is what the promise costs.
   */
  it("keeps checking often enough for the banner to be true", () => {
    vi.useFakeTimers();
    const rig = scripted();
    const slot = { current: null as BrowserTransport | null };
    const stop = attach(slot, rig.make, sinksOf([]));

    for (let i = 0; i < 6; i += 1) {
      rig.emit({ kind: "status", status: "offline" });
      vi.advanceTimersByTime(5_000);
    }
    // Seven live transports built inside thirty-five seconds, not two.
    expect(rig.made).toBe(7);
    stop();
  });
});

describe("the no-host sentence", () => {
  it("does not claim a host went away", () => {
    expect(SAMPLE_NO_HOST).toContain("No sandbox is connected");
    expect(SAMPLE_NO_HOST).not.toContain("stopped answering");
  });
});

/**
 * "User cannot control it." The host has had `POST /browser/takeover` all
 * along and the state machine has the edge, so "you can always take over" was
 * true of the server and invisible on screen: while Saathi drove, every click
 * landed on a picture and the model could only say words about control it had
 * no way to cause. The card is where the wheel is actually offered.
 */
describe("asking for the wheel", () => {
  it("offers it while the agent is driving a real window", () => {
    const asked: string[] = [];
    render(
      <BrowserSessionCard
        session={LIVE}
        onResume={() => undefined}
        onTakeover={() => asked.push("wheel")}
        onRelay={() => undefined}
      />,
    );
    screen.getByText("Take the wheel").click();
    expect(asked).toEqual(["wheel"]);
  });

  it("says what taking it costs, next to the button", () => {
    render(
      <BrowserSessionCard
        session={LIVE}
        onResume={() => undefined}
        onTakeover={() => undefined}
      />,
    );
    expect(screen.getByText(/window becomes yours/i)).toBeTruthy();
  });

  /** Already yours: the way back is the resume affordance, not a second wheel. */
  it("does not offer it again once you are driving", () => {
    render(
      <BrowserSessionCard
        session={{ ...LIVE, state: "user-drive" }}
        onResume={() => undefined}
        onTakeover={() => undefined}
        onRelay={() => undefined}
      />,
    );
    expect(screen.queryByText("Take the wheel")).toBeNull();
  });

  /** A card with no window behind it must not offer a wheel that reaches
   *  nothing — the same rule that withholds the driving surface. */
  it("offers nothing on a card with no window behind it", () => {
    for (const session of [
      { ...LIVE, sample: SAMPLE },
      restoredCard(RESTORED) as BrowserSessionView,
      restoredCard({ ...RESTORED, state: "closed" }) as BrowserSessionView,
    ]) {
      const { unmount } = render(
        <BrowserSessionCard
          session={session}
          onResume={() => undefined}
          onTakeover={() => undefined}
          onRelay={() => undefined}
        />,
      );
      expect(screen.queryByText("Take the wheel")).toBeNull();
      unmount();
    }
  });
});
