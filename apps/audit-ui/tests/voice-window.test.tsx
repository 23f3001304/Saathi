import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VoiceWindow } from "../src/voice/VoiceWindow.tsx";
import type { SandboxSession } from "../src/api/agentBeat.ts";

function sessionOf(over: Partial<SandboxSession> = {}): SandboxSession {
  return {
    id: "web_1",
    sandbox: { surface: "container", id: "covenant-browse-warm_a" },
    merchant: "rigged.in",
    url: "https://rigged.in/checkout",
    title: "Checkout",
    state: "agent-drive",
    handoff: null,
    actions: [],
    ...over,
  };
}

/**
 * Voice mode showed the option cards and nothing else, so the stage went empty
 * the moment a card was tapped - which is exactly when the agent starts
 * opening shops and filling baskets. Hands-free is not eyes-free.
 */
describe("what a listening shopper is shown while a window drives", () => {
  it("names the shop and the page it is on", () => {
    render(<VoiceWindow session={sessionOf()} recent={[]} />);
    expect(screen.getByText("rigged.in")).toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });

  it("says what the window is doing", () => {
    render(<VoiceWindow session={sessionOf()} recent={[]} />);
    expect(screen.getByText(/working in the shop/i)).toBeInTheDocument();
  });

  it("falls back to the URL when a page has no title", () => {
    render(<VoiceWindow session={sessionOf({ title: "" })} recent={[]} />);
    expect(
      screen.getByText("https://rigged.in/checkout"),
    ).toBeInTheDocument();
  });

  it("lists the moves the host watched it make", () => {
    render(
      <VoiceWindow
        session={sessionOf()}
        recent={["Read the page", "Put it in the shop's basket"]}
      />,
    );
    expect(screen.getByText("Read the page")).toBeInTheDocument();
    expect(
      screen.getByText("Put it in the shop's basket"),
    ).toBeInTheDocument();
  });
});

describe("a window that needs the shopper", () => {
  /** The one thing a listener has to act on, said on the stage as well as
   *  aloud: a spoken sentence is gone the moment it is finished. */
  it("shows what it is waiting for", () => {
    render(
      <VoiceWindow
        session={sessionOf({
          state: "user-drive",
          handoff: { reason: "sign-in", ask: "Sign in to rigged.in" },
        })}
        recent={[]}
      />,
    );
    expect(screen.getByText("Sign in to rigged.in")).toBeInTheDocument();
    expect(screen.getByText(/the window is yours/i)).toBeInTheDocument();
  });
});
