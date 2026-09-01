import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { JSX } from "react";
import { Composer } from "../src/conversation/Composer.tsx";
import { fakeKit, type FakeKit } from "./support/fakeVoice.ts";
import { installMemoryStorage } from "./support/memoryStorage.ts";

const OPEN = "Open voice mode";
const CLOSE = "Close voice mode";
const LISTENING = "Stop listening and send";
const REPLY = "Two kilos of rice, ninety-six rupees.";

/** Hands-free sending waits on a turn-end decision. Tests answer it instantly
 *  and locally: reaching a vendor from a unit test is never acceptable, and a
 *  900 ms network budget inside a `waitFor` is a flake waiting to happen. */
const FINISHED = { complete: async (): Promise<boolean> => true };

function mount(kit: FakeKit, blocked = false) {
  const onSend = vi.fn();
  const dock = (speakText: string): JSX.Element => (
    <Composer
      blocked={blocked}
      onSend={onSend}
      voiceKit={kit}
      turnEnd={FINISHED}
      speakText={speakText}
    />
  );
  const view = render(dock(""));
  return { onSend, reply: (text: string) => view.rerender(dock(text)) };
}

function open(): void {
  fireEvent.click(screen.getByLabelText(OPEN));
}

/** The dialog's own live region; the row gives its up while covered. */
function status(): string {
  return screen.getByRole("status").textContent ?? "";
}

/** Scoped: the row underneath names its microphone the same way. */
function orb(label: string): HTMLElement {
  return within(screen.getByRole("dialog")).getByLabelText(label);
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

beforeEach(installMemoryStorage);
afterEach(() => vi.unstubAllGlobals());

describe("VoiceMode — the hands-free loop", () => {
  it("listens, sends, speaks the reply, then listens again", async () => {
    const kit = fakeKit();
    const { onSend, reply } = mount(kit);

    open();
    expect(kit.recognizer.starts).toHaveLength(1);
    act(() => kit.recognizer.emit({ kind: "listening" }));
    expect(status()).toBe("Listening");

    act(() => kit.recognizer.emit({ kind: "final", text: "do kilo chawal" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("do kilo chawal"));
    expect(status()).toBe("Working out what you said");

    act(() => reply(REPLY));
    expect(kit.synthesizer.spoken).toEqual([REPLY]);
    expect(status()).toBe("Speaking");
    expect(screen.getByRole("dialog")).toHaveTextContent(REPLY);

    act(() => kit.synthesizer.finish());
    expect(kit.recognizer.starts).toHaveLength(2);
    expect(status()).toBe("Listening");
  });

  it("reads aloud in voice mode without opting the rest of the app in", () => {
    const kit = fakeKit();
    const { reply } = mount(kit);
    expect(screen.getByLabelText("Read replies aloud")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    open();
    act(() => reply(REPLY));
    expect(kit.synthesizer.spoken).toEqual([REPLY]);

    fireEvent.click(screen.getByLabelText(CLOSE));
    expect(window.localStorage.getItem("saathi.voice.speakReplies")).toBeNull();
    expect(screen.getByLabelText("Read replies aloud")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows the guess quietly and the committed line in full", () => {
    const kit = fakeKit();
    mount(kit);
    open();
    act(() => kit.recognizer.emit({ kind: "listening" }));
    act(() => kit.recognizer.emit({ kind: "interim", text: "do kilo" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("do kilo");

    act(() => kit.recognizer.emit({ kind: "final", text: "do kilo chawal" }));
    expect(dialog).toHaveTextContent("do kilo chawal");
  });

  it("tapping the orb while it speaks barges in", () => {
    const kit = fakeKit();
    const { reply } = mount(kit);
    open();
    act(() => kit.recognizer.emit({ kind: "final", text: "wait" }));
    act(() => reply(REPLY));

    fireEvent.click(orb("Interrupt and speak"));
    expect(kit.synthesizer.cancels).toBeGreaterThan(0);
    expect(kit.recognizer.starts).toHaveLength(2);
    expect(status()).toBe("Listening");
  });

  it("tapping while listening stops and sends what it has", async () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);
    open();
    act(() => kit.recognizer.emit({ kind: "listening" }));
    act(() => kit.recognizer.emit({ kind: "interim", text: "two kilos" }));

    fireEvent.click(orb(LISTENING));
    expect(kit.recognizer.stops).toBeGreaterThan(0);
    act(() => kit.recognizer.emit({ kind: "stopped" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("two kilos"));
  });

  it("a tap while it is still working out the words does nothing", () => {
    const kit = fakeKit();
    mount(kit);
    open();
    act(() => kit.recognizer.emit({ kind: "transcribing" }));

    const thinking = orb("Working out what you said");
    expect(thinking).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(thinking);
    expect(kit.recognizer.starts).toHaveLength(1);
    expect(status()).toBe("Working out what you said");
  });

  it("never speaks once the surface is gone", () => {
    const kit = fakeKit();
    const { reply } = mount(kit);
    open();
    act(() => reply(REPLY));

    fireEvent.click(screen.getByLabelText(CLOSE));
    expect(kit.synthesizer.cancels).toBeGreaterThan(0);
    act(() => reply("a second reply nobody asked to hear"));
    expect(kit.synthesizer.spoken).toEqual([REPLY]);
  });

  it("muting stops listening and does not resume after a reply", () => {
    const kit = fakeKit();
    const { reply } = mount(kit);
    open();
    fireEvent.click(screen.getByLabelText("Mute the microphone"));
    expect(kit.recognizer.stops).toBeGreaterThan(0);
    expect(status()).toBe("Microphone muted");

    act(() => kit.recognizer.emit({ kind: "final", text: "already heard" }));
    act(() => reply(REPLY));
    act(() => kit.synthesizer.finish());
    expect(kit.recognizer.starts).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Unmute the microphone"));
    expect(kit.recognizer.starts).toHaveLength(2);
  });
});

describe("VoiceMode — the surface itself", () => {
  it("takes focus, locks the page and gives focus back on Escape", () => {
    const kit = fakeKit();
    mount(kit);
    const trigger = screen.getByLabelText(OPEN);
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByLabelText(OPEN)).toHaveFocus();
  });

  it("closes from its own button, and hands focus back there too", () => {
    const kit = fakeKit();
    mount(kit);
    screen.getByLabelText(OPEN).focus();
    open();

    fireEvent.click(screen.getByLabelText(CLOSE));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText(OPEN)).toHaveFocus();
  });

  it("keeps Tab inside the surface", () => {
    const kit = fakeKit();
    mount(kit);
    open();
    const dialog = screen.getByRole("dialog");
    const close = screen.getByLabelText(CLOSE);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(close).not.toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("the bloom is shaped by the microphone, not by a clock", () => {
    const kit = fakeKit();
    mount(kit);
    open();
    expect(kit.meter.starts).toBe(1);

    const bloom = (): string =>
      screen.getByRole("dialog").querySelector("path")?.getAttribute("d") ?? "";
    const silent = bloom();
    act(() => kit.meter.emit(0.9));

    expect(silent).not.toBe("");
    expect(bloom()).not.toBe(silent);
    expect(bloom()).not.toContain("NaN");
  });

  it("§3 reduced motion — the orb is still and the meter never starts", () => {
    stubMatchMedia(true);
    const kit = fakeKit();
    mount(kit);
    open();

    expect(kit.meter.starts).toBe(0);
    expect(orb(LISTENING).className).toMatch(/still/);
    expect(orb(LISTENING).className).not.toMatch(/undefined/);
  });

  it("§8 fail-closed — a blocked dock cannot open voice mode", () => {
    const kit = fakeKit();
    mount(kit, true);
    const trigger = screen.getByLabelText(OPEN);

    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(kit.recognizer.starts).toHaveLength(0);
  });

  it("offers no way in when the browser cannot listen at all", () => {
    mount(fakeKit(false));
    expect(screen.queryByLabelText(OPEN)).toBeNull();
  });

  it("names every control rather than shipping a bare icon", () => {
    const kit = fakeKit();
    mount(kit);
    open();

    expect(screen.getByLabelText("Mute the microphone").tagName).toBe("BUTTON");
    expect(screen.getByLabelText(CLOSE).tagName).toBe("BUTTON");
    expect(orb(LISTENING).tagName).toBe("BUTTON");
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Voice mode");
  });
});

describe("the two surfaces disagree about sending, on purpose", () => {
  it("sends a hands-free utterance, because there is nothing to press", async () => {
    const kit = fakeKit();
    const { onSend, reply } = mount(kit);

    open();
    act(() => kit.recognizer.emit({ kind: "listening" }));
    act(() => kit.recognizer.emit({ kind: "final", text: "do kilo chawal" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("do kilo chawal"));

    // And the loop still comes back round to listening once the reply ends.
    act(() => reply(REPLY));
    act(() => kit.synthesizer.finish());
    expect(kit.recognizer.starts).toHaveLength(2);
  });

  it("does not send the same utterance dictated from the row", () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    fireEvent.click(screen.getByLabelText("Speak instead of typing"), {
      detail: 0,
    });
    act(() => kit.recognizer.emit({ kind: "final", text: "do kilo chawal" }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("goes back to not sending after voice mode is closed", async () => {
    const kit = fakeKit();
    const { onSend } = mount(kit);

    open();
    act(() => kit.recognizer.emit({ kind: "final", text: "first" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("first"));

    fireEvent.click(screen.getByLabelText(CLOSE));
    fireEvent.click(screen.getByLabelText("Speak instead of typing"), {
      detail: 0,
    });
    act(() => kit.recognizer.emit({ kind: "final", text: "second" }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

// Hands-free is not eyes-free. Voice mode used to describe three shoes it
// would not show, so a shopper heard "the cheapest is my first choice" with
// nothing on screen to check it against.
describe("what voice mode has on the table", () => {
  it("renders what the conversation put there", () => {
    const kit = fakeKit();
    render(
      <Composer
        blocked={false}
        onSend={() => undefined}
        voiceKit={kit}
        turnEnd={FINISHED}
        voiceStage={<p>Kolam Run City trainer, UK 7</p>}
      />,
    );
    open();
    expect(screen.getByText(/Kolam Run City trainer/)).toBeTruthy();
  });

  it("shows nothing when the conversation has nothing to show", () => {
    const kit = fakeKit();
    render(
      <Composer
        blocked={false}
        onSend={() => undefined}
        voiceKit={kit}
        turnEnd={FINISHED}
      />,
    );
    open();
    expect(screen.queryByText(/Kolam Run City trainer/)).toBeNull();
  });
});
