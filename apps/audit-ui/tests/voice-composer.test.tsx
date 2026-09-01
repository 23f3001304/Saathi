import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../src/conversation/Composer.tsx";
import { fakeKit, type FakeKit } from "./support/fakeVoice.ts";
import { installMemoryStorage } from "./support/memoryStorage.ts";

const MIC = "Speak instead of typing";
const FIELD = "Ask Saathi…";

function mount(kit: FakeKit, blocked = false) {
  const onSend = vi.fn();
  render(
    <Composer blocked={blocked} onSend={onSend} voiceKit={kit} speakText="" />,
  );
  return { onSend };
}

/** The keyboard path: Enter/Space on a button produces a click with detail 0. */
function pressMic(label = MIC): void {
  fireEvent.click(screen.getByLabelText(label), { detail: 0 });
}

beforeEach(installMemoryStorage);

describe("Composer + voice — the transcript lands in the field", () => {
  it("streams partials in and leaves the final line for the user to send", () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    pressMic();
    expect(kit.recognizer.starts).toHaveLength(1);

    act(() => kit.recognizer.emit({ kind: "interim", text: "two kilos" }));
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue("two kilos");

    act(() =>
      kit.recognizer.emit({ kind: "final", text: "two kilos of rice" }),
    );
    // Dictating is typing, not sending: a mis-heard word has to be fixable
    // before it becomes a purchase request.
    expect(screen.getByPlaceholderText(FIELD)).toHaveValue("two kilos of rice");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the dictated line only when the user actually submits it", () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    pressMic();
    act(() =>
      kit.recognizer.emit({ kind: "final", text: "two kilos of rice" }),
    );
    const field = screen.getByPlaceholderText(FIELD);
    fireEvent.submit(field.closest("form") as HTMLFormElement);

    expect(onSend).toHaveBeenCalledWith("two kilos of rice");
  });

  it("lets the user correct a mis-heard word before sending it", () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    pressMic();
    act(() => kit.recognizer.emit({ kind: "final", text: "two kilos of ice" }));
    const field = screen.getByPlaceholderText(FIELD);
    fireEvent.change(field, { target: { value: "two kilos of rice" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);

    expect(onSend).toHaveBeenCalledWith("two kilos of rice");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("keeps what was already typed as the prefix", () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    fireEvent.change(screen.getByPlaceholderText(FIELD), {
      target: { value: "add" },
    });
    pressMic();
    act(() => kit.recognizer.emit({ kind: "final", text: "two kilos" }));

    expect(screen.getByPlaceholderText(FIELD)).toHaveValue("add two kilos");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("appends a second dictation rather than replacing the first", () => {
    const kit = fakeKit();
    mount(kit);

    pressMic();
    act(() =>
      kit.recognizer.emit({ kind: "final", text: "two kilos of rice" }),
    );
    pressMic();
    act(() => kit.recognizer.emit({ kind: "final", text: "and some dal" }));

    expect(screen.getByPlaceholderText(FIELD)).toHaveValue(
      "two kilos of rice and some dal",
    );
  });

  it("typing still works exactly as before, with voice never touched", () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    const field = screen.getByPlaceholderText(FIELD);
    fireEvent.change(field, { target: { value: "just typing" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);

    expect(onSend).toHaveBeenCalledWith("just typing");
    expect(kit.recognizer.starts).toHaveLength(0);
  });

  it("a second press stops the microphone rather than doing nothing", () => {
    const kit = fakeKit();
    mount(kit);
    pressMic();
    act(() => kit.recognizer.emit({ kind: "listening" }));

    pressMic("Listening: press to stop");
    expect(kit.recognizer.stops).toBeGreaterThan(0);
  });

  it("ignores a press while a batch engine is still transcribing", () => {
    const kit = fakeKit();
    mount(kit);
    pressMic();
    act(() => kit.recognizer.emit({ kind: "transcribing" }));

    pressMic("Working out what you said");
    expect(kit.recognizer.starts).toHaveLength(1);
  });

  it("holding talks and releasing sends", () => {
    const kit = fakeKit();
    mount(kit);
    const mic = screen.getByLabelText(MIC);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    fireEvent.pointerDown(mic);
    expect(kit.recognizer.starts).toHaveLength(1);

    now.mockReturnValue(2_000);
    fireEvent.pointerUp(mic);
    expect(kit.recognizer.stops).toBeGreaterThan(0);
    now.mockRestore();
  });

  it("a quick tap latches instead, so long sentences need no held thumb", () => {
    const kit = fakeKit();
    mount(kit);
    const mic = screen.getByLabelText(MIC);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    fireEvent.pointerDown(mic);
    now.mockReturnValue(1_100);
    fireEvent.pointerUp(mic);

    expect(kit.recognizer.starts).toHaveLength(1);
    expect(kit.recognizer.stops).toBe(0);
    now.mockRestore();
  });

  it("says plainly when the browser cannot listen, and disables the control", () => {
    const kit = fakeKit(false);
    mount(kit);

    const mic = screen.getByLabelText(
      "Voice input is not available in this browser",
    );
    expect(mic).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("can't listen");
  });

  it("a denied microphone is rendered, not swallowed", () => {
    const kit = fakeKit();
    mount(kit);
    pressMic();
    act(() =>
      kit.recognizer.emit({ kind: "fault", fault: "permission-denied" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Microphone blocked. Allow it in the address bar",
    );
  });

  it("§8 fail-closed — a blocked dock blocks voice too", () => {
    const kit = fakeKit();
    mount(kit, true);
    expect(screen.getByLabelText(MIC)).toBeDisabled();
    expect(
      screen.getByLabelText("Language for speaking and listening"),
    ).toBeDisabled();
  });

  it("every voice control is reachable by name and by keyboard", () => {
    const kit = fakeKit();
    mount(kit);

    expect(screen.getByLabelText(MIC).tagName).toBe("BUTTON");
    expect(
      screen.getByLabelText("Language for speaking and listening").tagName,
    ).toBe("SELECT");
    const speak = screen.getByLabelText("Read replies aloud");
    expect(speak).toHaveAttribute("aria-pressed", "false");
  });

  it("read-aloud is off until pressed, and remembers being pressed", () => {
    const kit = fakeKit();
    mount(kit);
    const speak = screen.getByLabelText("Read replies aloud");

    fireEvent.click(speak);
    expect(speak).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("saathi.voice.speakReplies")).toBe("on");
  });

  it("switching language stops a run in progress", () => {
    const kit = fakeKit();
    mount(kit);
    pressMic();
    act(() => kit.recognizer.emit({ kind: "listening" }));

    fireEvent.change(
      screen.getByLabelText("Language for speaking and listening"),
      { target: { value: "ta-IN" } },
    );
    expect(kit.recognizer.stops).toBeGreaterThan(0);
    act(() => kit.recognizer.emit({ kind: "stopped" }));

    pressMic();
    expect(kit.recognizer.starts.at(-1)).toBe("ta-IN");
  });
});
