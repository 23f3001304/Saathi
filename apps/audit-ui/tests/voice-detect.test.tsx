// The shopper is not one language. These cover the whole path: nothing chosen
// means the engine is asked to work it out, what it heard reaches the voice
// that answers, and an explicit choice still wins when someone makes one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { JSX } from "react";
import { Composer } from "../src/conversation/Composer.tsx";
import { DETECT } from "../src/voice/detectedLanguage.ts";
import { fakeKit, type FakeKit } from "./support/fakeVoice.ts";
import { installMemoryStorage } from "./support/memoryStorage.ts";

const MIC = "Speak instead of typing";
const PICKER = "Language for speaking and listening";
const FINISHED = { complete: async (): Promise<boolean> => true };

function mount(kit: FakeKit) {
  const onSend = vi.fn();
  const dock = (speakText: string): JSX.Element => (
    <Composer
      blocked={false}
      onSend={onSend}
      voiceKit={kit}
      turnEnd={FINISHED}
      speakText={speakText}
    />
  );
  const view = render(dock(""));
  return { onSend, reply: (text: string) => view.rerender(dock(text)) };
}

function pressMic(): void {
  fireEvent.click(screen.getByLabelText(MIC), { detail: 0 });
}

function choose(code: string): void {
  fireEvent.change(screen.getByLabelText(PICKER), { target: { value: code } });
}

/** The hands-free surface, where a reply is read aloud without opting in. */
function openMode(): void {
  fireEvent.click(screen.getByLabelText("Open voice mode"));
}

beforeEach(installMemoryStorage);

describe("listening — the engine is asked, not told", () => {
  it("starts on detect, so nobody has to declare a language first", () => {
    const kit = fakeKit();
    mount(kit);
    expect(screen.getByLabelText(PICKER)).toHaveValue(DETECT);

    pressMic();
    expect(kit.recognizer.starts).toEqual([DETECT]);
  });

  it("sends an explicit choice as itself — knowing your language still counts", () => {
    const kit = fakeKit();
    mount(kit);
    choose("ta-IN");

    pressMic();
    expect(kit.recognizer.starts).toEqual(["ta-IN"]);
    expect(window.localStorage.getItem("saathi.voice.language")).toBe("ta-IN");
  });

  it("changing language mid-run leaves nothing listening behind it", () => {
    const kit = fakeKit();
    mount(kit);
    pressMic();
    act(() => kit.recognizer.emit({ kind: "listening" }));

    choose("hi-IN");
    expect(kit.recognizer.stops).toBeGreaterThan(0);
    // The change stops the run; it does not quietly open a second one.
    expect(kit.recognizer.starts).toEqual([DETECT]);
    act(() => kit.recognizer.emit({ kind: "stopped" }));

    pressMic();
    expect(kit.recognizer.starts).toEqual([DETECT, "hi-IN"]);
  });
});

describe("answering — the voice follows the words", () => {
  it("replies in the language the engine said it heard", async () => {
    const kit = fakeKit();
    const { onSend, reply } = mount(kit);
    openMode();

    act(() =>
      kit.recognizer.emit({
        kind: "final",
        text: "enakku oru sattai venum",
        language: "ta-IN",
      }),
    );
    await waitFor(() => expect(onSend).toHaveBeenCalled());

    act(() => reply("Ninety-six rupees, shall I place it?"));
    expect(kit.synthesizer.languages.at(-1)).toBe("ta-IN");
  });

  it("follows a Devanagari reply even when the shopper typed Latin script", async () => {
    const kit = fakeKit();
    const { onSend, reply } = mount(kit);
    openMode();

    act(() =>
      kit.recognizer.emit({
        kind: "final",
        text: "mujhe neela kurta chahiye",
        language: "en-IN",
      }),
    );
    await waitFor(() => expect(onSend).toHaveBeenCalled());

    act(() => reply("ज़रूर, मैं नीला कुर्ता देखता हूँ"));
    expect(kit.synthesizer.languages.at(-1)).toBe("hi-IN");
  });

  it("an explicit choice speaks that language when the reply gives nothing away", () => {
    const kit = fakeKit();
    const { reply } = mount(kit);
    choose("bn-IN");
    openMode();

    act(() => reply("ok"));
    expect(kit.synthesizer.languages.at(-1)).toBe("bn-IN");
  });
});

describe("showing what it decided", () => {
  it("names the detected language on the row the shopper is already on", () => {
    const kit = fakeKit();
    mount(kit);
    pressMic();
    expect(screen.getByRole("option", { name: "Detect" })).toBeInTheDocument();

    act(() =>
      kit.recognizer.emit({
        kind: "final",
        text: "எனக்கு ஒரு சட்டை வேண்டும்",
        language: "ta-IN",
      }),
    );

    expect(screen.getByLabelText(PICKER)).toHaveValue(DETECT);
    expect(
      screen.getByRole("option", { name: "Detect · தமிழ்" }),
    ).toBeInTheDocument();
  });
});
