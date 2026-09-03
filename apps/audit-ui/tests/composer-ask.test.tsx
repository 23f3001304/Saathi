// Everything the run can want from a person renders at the dock. The
// transcript is the record; the composer is the one thing being asked for now.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Composer } from "../src/conversation/Composer.tsx";
import { reduceSignals } from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";

const ASK: AssistantSignal = {
  kind: "ask",
  id: "urn:covenant:ask:1",
  prompt: "Internal or external, and what capacity?",
  replies: ["256GB", "512GB", "1TB"],
};

describe("an ask is one utterance and one dock state", () => {
  it("arms the composer and prints nothing while it is live", () => {
    const state = reduceSignals([ASK]);

    expect(state.question).toEqual({
      id: ASK.id,
      prompt: "Internal or external, and what capacity?",
      replies: ["256GB", "512GB", "1TB"],
    });
    // The composer is the one place a live question renders. Printing it in
    // the transcript too put the same sentence directly above the dock that
    // was already asking it.
    expect(state.entries).toEqual([]);
  });

  it("becomes history above the answer once they answer", () => {
    const state = reduceSignals([ASK, { kind: "buyer", text: "1TB external" }]);

    expect(state.question).toBeNull();
    expect(state.running).toBe(true);
    expect(state.entries).toEqual([
      { kind: "agent", text: "Internal or external, and what capacity?" },
      { kind: "buyer", text: "1TB external" },
    ]);
  });

  it("goes idle when the run reaches an outcome", () => {
    const state = reduceSignals([
      { kind: "buyer", text: "1TB external" },
      { kind: "run-idle" },
    ]);

    expect(state.running).toBe(false);
  });
});

describe("the dock carries the ask", () => {
  it("shows the question and its answers as chips", () => {
    const answer = vi.fn();
    render(
      <Composer
        blocked={false}
        onSend={vi.fn()}
        prompt={ASK.prompt}
        actions={[{ label: "1TB", onClick: answer }]}
        openLabel="Type your answer"
        stage="ask"
      />,
    );

    expect(screen.getByText(ASK.prompt)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1TB" }));
    expect(answer).toHaveBeenCalledTimes(1);
    // The typed answer is always one tap away; chips never close the door.
    expect(screen.getByRole("button", { name: "Type your answer" })).toBeTruthy();
  });

  it("says what the empty field is for when there are no chips", () => {
    render(
      <Composer
        blocked={false}
        onSend={vi.fn()}
        prompt="What size do you need?"
        placeholder="Answer here…"
        stage="ask"
      />,
    );

    expect(screen.getByText("What size do you need?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Answer here…")).toBeTruthy();
  });

  it("asks for the pick at the dock while options are live", () => {
    render(
      <Composer
        blocked={false}
        onSend={vi.fn()}
        prompt="Pick one and I will go and do that in the window."
        stage="pick"
      />,
    );

    expect(
      screen.getByText("Pick one and I will go and do that in the window."),
    ).toBeTruthy();
  });
});

// A park with nothing to ask is a designed shape (§6.2): the run stops, the
// composer waits, and the agent has no sentence for it. Rendered anyway, the
// empty prompt was an empty bubble in the transcript and an empty line at the
// dock.
describe("a question with nothing written on it", () => {
  it("writes no bubble when the answer comes in", () => {
    const state = reduceSignals([
      { kind: "ask", id: "urn:covenant:ask:2", prompt: "", replies: [] },
      { kind: "buyer", text: "the crucial" },
    ]);

    expect(state.entries).toEqual([{ kind: "buyer", text: "the crucial" }]);
  });

  it("leaves the dock to its placeholder", () => {
    const { container } = render(
      <Composer
        blocked={false}
        onSend={vi.fn()}
        prompt=""
        placeholder="Answer here…"
        stage="ask"
      />,
    );

    expect(container.querySelector("[class*=prompt]")).toBeNull();
    expect(screen.getByPlaceholderText("Answer here…")).toBeTruthy();
  });
});
