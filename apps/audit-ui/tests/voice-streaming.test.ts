import { describe, expect, it } from "vitest";
import { DETECT } from "../src/voice/detectedLanguage.ts";
import { SARVAM_CHUNK_BYTES } from "../src/voice/sarvamContract.ts";
import { transcriptEvent } from "../src/voice/sarvamStreamEvents.ts";
import { driveRecognizer, settle } from "./support/streamHarness.ts";

describe("SarvamStreamRecognizer — the handshake", () => {
  it("carries the key as a subprotocol, because a browser cannot set headers", async () => {
    const { recognizer, listen, last } = driveRecognizer();
    recognizer.start("hi-IN", listen);
    await settle();

    expect(last()?.protocols).toEqual(["api-subscription-key.test-key"]);
  });

  it("asks for the realtime model, the language, and linear16 at 16 kHz", async () => {
    const { recognizer, listen, last } = driveRecognizer();
    recognizer.start("ta-IN", listen);
    await settle();

    const url = new URL(last()?.url ?? "");
    expect(url.pathname).toBe("/speech-to-text-realtime/ws");
    expect(url.searchParams.get("model")).toBe("saaras:v3-realtime");
    expect(url.searchParams.get("language_code")).toBe("ta-IN");
    expect(url.searchParams.get("encoding")).toBe("linear16");
    expect(url.searchParams.get("sample_rate")).toBe("16000");
  });
});

describe("SarvamStreamRecognizer — detection over the socket", () => {
  it("asks the realtime model to work the language out for itself", async () => {
    const { recognizer, listen, last } = driveRecognizer();
    recognizer.start(DETECT, listen);
    await settle();

    // Not "unknown": the realtime socket spells detection differently from
    // the REST endpoint, and reports no language at all for anything else.
    const url = new URL(last()?.url ?? "");
    expect(url.searchParams.get("language_code")).toBe("auto");
  });

  it("carries the language off the final frame into the transcript", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start(DETECT, listen);
    await settle();
    last()?.accept();
    last()?.deliver({
      event: "transcript.final",
      text: "எனக்கு ஒரு சட்டை வேண்டும்",
      language: "ta-IN",
    });

    expect(events).toContainEqual({
      kind: "final",
      text: "எனக்கு ஒரு சட்டை வேண்டும்",
      language: "ta-IN",
    });
  });
});

describe("SarvamStreamRecognizer — interim results arrive before the final", () => {
  it("emits each partial as it lands, then the final", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();
    last()?.deliver({ event: "transcript.partial", text: "two kilos" });
    last()?.deliver({ event: "transcript.partial", text: "two kilos of" });
    last()?.deliver({ event: "transcript.final", text: "two kilos of rice" });

    expect(events).toEqual([
      { kind: "listening" },
      { kind: "interim", text: "two kilos" },
      { kind: "interim", text: "two kilos of" },
      { kind: "final", text: "two kilos of rice", language: "en-IN" },
      { kind: "stopped" },
    ]);
  });

  it("puts partials on screen while no final exists — the point of streaming", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();
    last()?.deliver({ event: "transcript.partial", text: "half a sentence" });

    expect(events).toContainEqual({ kind: "interim", text: "half a sentence" });
    expect(events.some((e) => e.kind === "final")).toBe(false);
  });
});

describe("SarvamStreamRecognizer — frames it deliberately ignores", () => {
  it("ignores the frames that do not change the screen", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();
    last()?.deliver({ event: "session.begin" });
    last()?.deliver({ event: "vad.speech_start" });
    last()?.deliver({ event: "pong" });

    expect(events).toEqual([{ kind: "listening" }]);
  });
});

describe("SarvamStreamRecognizer — microphone audio on the wire", () => {
  it("coalesces worklet frames into the ~100ms chunk Sarvam documents", async () => {
    const { recognizer, listen, capture, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();

    capture.emit(SARVAM_CHUNK_BYTES / 2);
    expect(last()?.sent).toHaveLength(0);

    capture.emit(SARVAM_CHUNK_BYTES / 2);
    expect(last()?.sent).toHaveLength(1);
    const frame = JSON.parse(last()?.sent[0] ?? "{}");
    expect(frame.event).toBe("audio_input");
    expect(typeof frame.audio).toBe("string");
  });
});

describe("the realtime wire format", () => {
  it("distinguishes partial from final by the event name", () => {
    expect(
      transcriptEvent('{"event":"transcript.partial","text":"a"}', "en-IN"),
    ).toEqual({ kind: "interim", text: "a" });
    expect(
      transcriptEvent('{"event":"transcript.final","text":"b"}', "en-IN"),
    ).toEqual({ kind: "final", text: "b", language: "en-IN" });
  });

  it("treats a fatal error frame as a rejected key", () => {
    expect(
      transcriptEvent('{"event":"error","is_fatal":true}', DETECT),
    ).toEqual({
      kind: "fault",
      fault: "permission-denied",
    });
  });

  it("does not crash on a frame it has never seen", () => {
    expect(transcriptEvent("not json", DETECT)).toBeNull();
    expect(transcriptEvent('{"event":"something.new"}', DETECT)).toBeNull();
    expect(transcriptEvent("null", DETECT)).toBeNull();
  });
});
