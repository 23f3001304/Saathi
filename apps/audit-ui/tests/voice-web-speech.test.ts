import { describe, expect, it, vi } from "vitest";
import type { RecognizerEvent } from "../src/voice/ports.ts";
import { WebSpeechRecognizer } from "../src/voice/webSpeechRecognizer.ts";
import { WebSpeechSynthesizer } from "../src/voice/webSpeechSynthesizer.ts";
import { faultOfCode } from "../src/voice/webSpeechTypes.ts";
import {
  fakeEngineCtor,
  resultEvent,
  type FakeEngine,
} from "./support/fakeWebSpeech.ts";

function drive(failStart = false) {
  const engines: FakeEngine[] = [];
  const events: RecognizerEvent[] = [];
  const recognizer = new WebSpeechRecognizer(
    fakeEngineCtor(engines, failStart),
  );
  const listen = (event: RecognizerEvent): void => {
    events.push(event);
  };
  return { engines, events, recognizer, listen, last: () => engines.at(-1) };
}

describe("WebSpeechRecognizer — starting and hearing", () => {
  it("asks for one utterance per press, with partials switched on", () => {
    const { recognizer, listen, last } = drive();
    recognizer.start("ta-IN", listen);

    expect(last()?.lang).toBe("ta-IN");
    expect(last()?.interimResults).toBe(true);
    expect(last()?.continuous).toBe(false);
  });

  it("cannot detect, so it says which language it was actually given", () => {
    const { recognizer, listen, events, last } = drive();
    recognizer.start("detect", listen);
    last()?.onresult?.(resultEvent("two kilos of rice", true));

    expect(last()?.lang).toBe("en-IN");
    expect(events).toContainEqual({
      kind: "final",
      text: "two kilos of rice",
      language: "en-IN",
    });
  });
});

describe("WebSpeechRecognizer — the language it reports", () => {
  it("reports a chosen language back as the one it heard", () => {
    const { recognizer, listen, events, last } = drive();
    recognizer.start("ta-IN", listen);
    last()?.onresult?.(resultEvent("vanakkam", true));

    expect(events).toContainEqual({
      kind: "final",
      text: "vanakkam",
      language: "ta-IN",
    });
  });

  it("reports partial and final results separately", () => {
    const { recognizer, listen, events, last } = drive();
    recognizer.start("en-IN", listen);
    last()?.onresult?.(resultEvent("two kilos", false));
    last()?.onresult?.(resultEvent("two kilos of rice ", true));

    expect(events).toContainEqual({ kind: "interim", text: "two kilos" });
    expect(events).toContainEqual({
      kind: "final",
      text: "two kilos of rice",
      language: "en-IN",
    });
  });
});

describe("every spec error code maps to a state the dock can render", () => {
  it("covers the documented codes", () => {
    expect(faultOfCode("not-allowed")).toBe("permission-denied");
    expect(faultOfCode("service-not-allowed")).toBe("permission-denied");
    expect(faultOfCode("audio-capture")).toBe("no-microphone");
    expect(faultOfCode("no-speech")).toBe("no-speech");
    expect(faultOfCode("language-not-supported")).toBe("language-unsupported");
    expect(faultOfCode("network")).toBe("network");
  });

  it("names an unknown vendor code rather than crashing on it", () => {
    expect(faultOfCode("something-new-in-chrome-142")).toBe("failed");
  });
});

describe("WebSpeechRecognizer — failing honestly", () => {
  it("does not report a tidy stop on top of a fault", () => {
    const { recognizer, listen, events, last } = drive();
    recognizer.start("en-IN", listen);
    last()?.onerror?.({ error: "not-allowed" });
    last()?.onend?.();

    expect(events.filter((e) => e.kind === "stopped")).toHaveLength(0);
    expect(events).toContainEqual({
      kind: "fault",
      fault: "permission-denied",
    });
  });

  it("a browser with no engine says so instead of doing nothing", () => {
    const recognizer = new WebSpeechRecognizer(null);
    const events: RecognizerEvent[] = [];

    expect(recognizer.supports()).toBe(false);
    expect(() =>
      recognizer.start("en-IN", (event) => events.push(event)),
    ).not.toThrow();
    expect(events).toEqual([{ kind: "fault", fault: "unsupported" }]);
  });

  it("a start() that throws becomes a fault, not an unhandled exception", () => {
    const { recognizer, listen, events } = drive(true);

    expect(() => recognizer.start("en-IN", listen)).not.toThrow();
    expect(events).toContainEqual({ kind: "fault", fault: "failed" });
  });
});

describe("WebSpeechSynthesizer", () => {
  it("a platform with no voice engine is unavailable, and says so", () => {
    const synthesizer = new WebSpeechSynthesizer(null);
    const events: string[] = [];

    expect(synthesizer.supports("hi-IN")).toBe(false);
    synthesizer.speak("hello", "hi-IN", (event) => events.push(event.kind));
    expect(events).toEqual(["fault"]);
  });

  it("cancels before it speaks, so replies never pile up", () => {
    const cancel = vi.fn();
    const synthesizer = new WebSpeechSynthesizer({
      speak: (_text, _language, onDone) => onDone(),
      cancel,
      languages: () => ["hi-in"],
    });
    synthesizer.speak("नमस्ते", "hi-IN", () => undefined);
    expect(cancel).toHaveBeenCalled();
  });

  it("matches an installed voice by language root", () => {
    const synthesizer = new WebSpeechSynthesizer({
      speak: () => undefined,
      cancel: () => undefined,
      languages: () => ["ta-lk", "en-gb"],
    });
    expect(synthesizer.supports("ta-IN")).toBe(true);
    expect(synthesizer.supports("ml-IN")).toBe(false);
  });
});
