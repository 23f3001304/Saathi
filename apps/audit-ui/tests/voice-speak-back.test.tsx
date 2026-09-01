import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DETECT } from "../src/voice/detectedLanguage.ts";
import { useSpokenReplies } from "../src/voice/useSpokenReplies.ts";
import {
  readLanguage,
  readSpeakReplies,
  writeLanguage,
  writeSpeakReplies,
} from "../src/voice/voicePreference.ts";
import { FakeSynthesizer } from "./support/fakeVoice.ts";
import {
  installMemoryStorage,
  withHostileStorage,
} from "./support/memoryStorage.ts";

const SPEAK_KEY = "saathi.voice.speakReplies";

function setup(synthesizer: FakeSynthesizer, text: string | undefined) {
  return renderHook(
    (props: { text: string | undefined }) =>
      useSpokenReplies({ synthesizer, language: "en-IN", text: props.text }),
    { initialProps: { text } },
  );
}

beforeEach(installMemoryStorage);

describe("useSpokenReplies — opt-in, remembered, interruptible", () => {
  it("is silent by default, however many replies arrive", () => {
    const synthesizer = new FakeSynthesizer();
    const { rerender } = setup(synthesizer, "first reply");
    rerender({ text: "second reply" });
    rerender({ text: "third reply" });
    expect(synthesizer.spoken).toEqual([]);
  });

  it("never speaks on first load, even with the preference remembered", () => {
    window.localStorage.setItem(SPEAK_KEY, "on");
    const synthesizer = new FakeSynthesizer();
    const { result } = setup(synthesizer, "a reply already on screen");

    expect(result.current.enabled).toBe(true);
    expect(synthesizer.spoken).toEqual([]);
  });

  it("switching it on reads what comes next, not what is already read", () => {
    const synthesizer = new FakeSynthesizer();
    const { result, rerender } = setup(synthesizer, "already on screen");

    act(() => result.current.setEnabled(true));
    expect(synthesizer.spoken).toEqual([]);

    rerender({ text: "a brand new reply" });
    expect(synthesizer.spoken).toEqual(["a brand new reply"]);
    expect(result.current.speaking).toBe(true);
  });

  it("remembers the choice across mounts", () => {
    const synthesizer = new FakeSynthesizer();
    const first = setup(synthesizer, undefined);
    act(() => first.result.current.setEnabled(true));
    first.unmount();

    const second = setup(new FakeSynthesizer(), undefined);
    expect(second.result.current.enabled).toBe(true);
  });

  it("can be stopped mid-utterance without switching the feature off", () => {
    const synthesizer = new FakeSynthesizer();
    const { result, rerender } = setup(synthesizer, "old");
    act(() => result.current.setEnabled(true));
    rerender({ text: "a long reply being read out" });
    expect(result.current.speaking).toBe(true);

    act(() => result.current.cancel());
    expect(synthesizer.cancels).toBeGreaterThan(0);
    expect(result.current.speaking).toBe(false);
    expect(result.current.enabled).toBe(true);
  });

  it("switching it off silences whatever is being said", () => {
    const synthesizer = new FakeSynthesizer();
    const { result, rerender } = setup(synthesizer, "old");
    act(() => result.current.setEnabled(true));
    rerender({ text: "mid sentence" });

    act(() => result.current.setEnabled(false));
    expect(synthesizer.cancels).toBeGreaterThan(0);
    expect(result.current.speaking).toBe(false);
  });

  it("reports unavailable when no engine can speak the chosen language", () => {
    const { result } = setup(new FakeSynthesizer(false), undefined);
    expect(result.current.available).toBe(false);
  });
});

describe("voice preferences — storage is a convenience, never a dependency", () => {
  it("falls back to silence and detection when storage cannot be read", () => {
    withHostileStorage(() => {
      expect(readSpeakReplies()).toBe(false);
      expect(readLanguage()).toBe(DETECT);
    });
  });

  it("writing to a storage that throws does not throw", () => {
    withHostileStorage(() => {
      expect(() => writeSpeakReplies(true)).not.toThrow();
      expect(() => writeLanguage("ta-IN")).not.toThrow();
    });
  });

  it("a hook mounted against hostile storage still works in memory", () => {
    withHostileStorage(() => {
      const synthesizer = new FakeSynthesizer();
      const { result, rerender } = setup(synthesizer, "old");

      expect(result.current.enabled).toBe(false);
      act(() => result.current.setEnabled(true));
      expect(result.current.enabled).toBe(true);

      rerender({ text: "spoken anyway" });
      expect(synthesizer.spoken).toEqual(["spoken anyway"]);
    });
  });

  it("ignores a stored language that is no longer offered", () => {
    window.localStorage.setItem("saathi.voice.language", "kl-GL");
    expect(readLanguage()).toBe(DETECT);
  });

  it("defaults to detection rather than assuming the shopper means English", () => {
    expect(readLanguage()).toBe(DETECT);
  });
});
