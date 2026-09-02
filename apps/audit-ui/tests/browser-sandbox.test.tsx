// The sandbox card, on both sides of the seam. Nothing is booted: what matters
// here is that the page never decides what may be touched, that a click lands
// where the user aimed it after the frame has been scaled, and that with no
// agent-host running the panel still says something true.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { BrowserSessionCard } from "../src/browser/BrowserSessionCard.tsx";
import { HANDOFF_LOGIN } from "../src/browser/browserFixture.ts";
import { fixtureBrowser } from "../src/browser/fixtureBrowser.ts";
import {
  parseFrame,
  parseRelay,
  parseSession,
} from "../src/browser/browserWire.ts";
import { pagePoint } from "../src/browser/viewportMath.ts";
import type { RelayInput } from "../src/browser/browserTransport.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const JPEG = "data:image/jpeg;base64,/9j/4AAQ";

const LIVE = {
  ...HANDOFF_LOGIN,
  sample: undefined,
  frame: PNG,
  frameWidth: 1000,
  frameHeight: 600,
  redacted: 2,
};

describe("mapping a click back onto the real window", () => {
  it("travels as a ratio, so the scaled picture still aims true", () => {
    const box = { left: 20, top: 10, width: 500, height: 300 };
    expect(pagePoint(box, 270, 160, 1000, 600)).toEqual({ x: 500, y: 300 });
    expect(pagePoint(box, 20, 10, 1000, 600)).toEqual({ x: 0, y: 0 });
  });

  it("falls back to one-to-one before a frame has arrived", () => {
    const box = { left: 0, top: 0, width: 500, height: 300 };
    expect(pagePoint(box, 40, 60, 0, 0)).toEqual({ x: 40, y: 60 });
  });
});

describe("the viewport while the wheel is yours", () => {
  it("sends a coordinate and a character, and never a selector", () => {
    const sent: RelayInput[] = [];
    render(
      <BrowserSessionCard
        session={LIVE}
        onResume={() => undefined}
        onRelay={(input) => sent.push(input)}
        refusal={null}
      />,
    );
    const frame = screen.getByAltText(LIVE.title);
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 300,
      right: 500,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(frame, { clientX: 250, clientY: 150 });
    fireEvent.keyDown(screen.getByRole("application"), { key: "a" });
    fireEvent.keyDown(screen.getByRole("application"), { key: "Enter" });
    expect(sent).toEqual([
      { kind: "click", x: 500, y: 300 },
      { kind: "type", text: "a" },
      { kind: "key", name: "Enter" },
    ]);
  });

  it("says how many fields were painted out of the picture", () => {
    render(
      <BrowserSessionCard
        session={LIVE}
        onResume={() => undefined}
        onRelay={() => undefined}
      />,
    );
    expect(screen.getByText(/2 fields are blacked out/)).toBeDefined();
  });
});

describe("a refused relay", () => {
  it("shows the harness's sentence and offers the real window instead", () => {
    let fronted = 0;
    render(
      <BrowserSessionCard
        session={LIVE}
        onResume={() => undefined}
        onRelay={() => undefined}
        onFront={() => (fronted += 1)}
        refusal={{
          ok: false,
          human:
            "That is a card security code. The agent never touches card data.",
          handOffNatively: true,
          nativeEntry:
            "Type it in the Saathi window — it just came to the front.",
          fronted: true,
        }}
      />,
    );
    expect(screen.getByText(/never touches card data/)).toBeDefined();
    expect(screen.getByText(/came to the front/)).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Bring the window to the front" }),
    );
    expect(fronted).toBe(1);
  });
});

describe("with no agent-host behind it", () => {
  it("runs the reel and refuses to pretend a click reached anything", async () => {
    const transport = fixtureBrowser();
    const stop = transport.start(() => undefined);
    const outcome = await transport.relay({ kind: "click", x: 1, y: 1 });
    stop();
    expect(transport.live).toBe(false);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.human).toContain("fixture reel");
    expect(outcome.handOffNatively).toBe(false);
  });
});

describe("reading agent-host's answers", () => {
  it("treats a closed window as a real answer, not a parse failure", () => {
    expect(parseSession({ ok: true, session: null })).toBeNull();
  });

  it("drops a frame whose image is not one of the two data URLs", () => {
    expect(parseFrame({ frame: { image: "javascript:alert(1)" } })).toBeNull();
    expect(parseFrame({ frame: { image: "data:text/html;base64,PHA+" } })).toBeNull();
    expect(
      parseFrame({ frame: { image: PNG, width: 8, height: 4, redacted: 1 } }),
    ).toEqual({
      kind: "frame",
      frame: { image: PNG, width: 8, height: 4, redacted: 1, passthrough: false },
    });
    // The screencast's own format, and the flag saying these are the
    // browser's own bytes because there was nothing on them to paint.
    expect(
      parseFrame({
        frame: {
          image: JPEG,
          width: 8,
          height: 4,
          redacted: 0,
          passthrough: true,
        },
      }),
    ).toEqual({
      kind: "frame",
      frame: { image: JPEG, width: 8, height: 4, redacted: 0, passthrough: true },
    });
    // A tick that carries no picture is news, not a parse failure.
    expect(
      parseFrame({
        frame: { blackout: { category: "password", human: "no" } },
      }),
    ).toEqual({
      kind: "blackout",
      blackout: { category: "password", human: "no" },
    });
  });

  it("reads an unreadable relay answer as 'not taken'", () => {
    const outcome = parseRelay("nonsense");
    expect(outcome.ok).toBe(false);
  });
});

// You can press anything the page offers while the wheel is yours, including
// its own checkout. That purchase happens on the merchant's site with your own
// payment method — no mandate, no verdict, no ledger row — and the card has to
// say so at the moment it becomes possible, not afterwards.
describe("a purchase made through the relay is outside the covenant", () => {
  it("says so while the shopper is driving", () => {
    render(
      <BrowserSessionCard
        session={{ ...HANDOFF_LOGIN, state: "user-drive" }}
        onResume={() => undefined}
        onRelay={() => undefined}
      />,
    );
    expect(screen.getByText(/not through Saathi/i)).toBeTruthy();
    expect(screen.getByText(/will not appear in your ledger/i)).toBeTruthy();
  });

  it("stays quiet while the agent is driving, because it cannot buy", () => {
    render(
      <BrowserSessionCard
        session={{ ...HANDOFF_LOGIN, state: "agent-drive", handoff: undefined }}
        onResume={() => undefined}
      />,
    );
    expect(screen.queryByText(/not through Saathi/i)).toBeNull();
  });
});
