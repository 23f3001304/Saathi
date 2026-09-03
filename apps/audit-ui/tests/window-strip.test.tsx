// The one line the chat keeps about a window that lives on another tab. It
// says what is happening in that window, so it follows the window's own state
// and not whether a turn is running: a research errand runs for a minute
// without touching a window, and "Working in the sandbox window" over it is
// the chat describing a room nobody is in.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WindowStrip } from "../src/conversation/WindowStrip.tsx";

describe("the window strip's line", () => {
  it("says the agent is working while the agent holds the window", () => {
    render(<WindowStrip state="agent-drive" attention={null} />);
    expect(screen.getByText("Working in the sandbox window.")).toBeTruthy();
  });

  it("says the window is yours while you hold it", () => {
    render(<WindowStrip state="user-drive" attention={null} />);
    expect(screen.getByText("The window is yours.")).toBeTruthy();
  });

  it("says only that a window is open while nobody is at it", () => {
    render(<WindowStrip state="idle" attention={null} />);
    expect(
      screen.getByText("A sandbox window is open for this chat."),
    ).toBeTruthy();
  });

  it("says nothing about a window that has closed", () => {
    const view = render(<WindowStrip state="closed" attention={null} />);
    expect(view.container.textContent).toBe("");
  });

  it("says nothing over an errand that never opened a window", () => {
    const view = render(<WindowStrip state={null} attention={null} />);
    expect(view.container.textContent).toBe("");
  });

  it("still calls you over when the window is waiting on a person", () => {
    render(<WindowStrip state="agent-drive" attention="handoff" />);
    expect(screen.getByText(/The window needs you/)).toBeTruthy();
  });

  it("still says a window is being opened before it reports", () => {
    render(<WindowStrip state={null} attention={null} launching={true} />);
    expect(screen.getByText(/Opening the shop's window/)).toBeTruthy();
  });
});
