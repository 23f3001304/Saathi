import { describe, expect, it, vi } from "vitest";
import type { RecognizerEvent } from "../src/voice/ports.ts";
import { SarvamStreamRecognizer } from "../src/voice/sarvamStreamRecognizer.ts";
import { driveRecognizer, settle } from "./support/streamHarness.ts";

/** Drop the socket repeatedly until the adapter has spent its retry budget. */
async function exhaust(
  harness: ReturnType<typeof driveRecognizer>,
): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    harness.last()?.accept();
    harness.last()?.drop();
    await vi.advanceTimersByTimeAsync(5000);
  }
}

describe("SarvamStreamRecognizer — a socket that drops mid-utterance", () => {
  it("commits what was already heard rather than losing the sentence", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();
    last()?.deliver({ event: "transcript.partial", text: "two kilos of rice" });
    last()?.drop();

    expect(events).toContainEqual({
      kind: "final",
      text: "two kilos of rice",
      language: "en-IN",
    });
    expect(events.at(-1)).toEqual({ kind: "stopped" });
  });

  it("does not report a fault over speech it managed to keep", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();
    last()?.deliver({ event: "transcript.partial", text: "something" });
    last()?.drop();

    expect(events.some((e) => e.kind === "fault")).toBe(false);
  });
});

describe("SarvamStreamRecognizer — reconnection", () => {
  it("retries a drop with nothing heard, leaving only one socket open", async () => {
    vi.useFakeTimers();
    const harness = driveRecognizer();
    harness.recognizer.start("en-IN", harness.listen);
    await settle();
    harness.last()?.accept();
    harness.last()?.drop();
    await vi.advanceTimersByTimeAsync(500);

    expect(harness.sockets).toHaveLength(2);
    expect(harness.live()).toHaveLength(1);
    vi.useRealTimers();
  });

  it("does not announce a second listening state for one press", async () => {
    vi.useFakeTimers();
    const { recognizer, listen, events, last } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    last()?.accept();
    last()?.drop();
    await vi.advanceTimersByTimeAsync(500);

    expect(events.filter((e) => e.kind === "listening")).toHaveLength(1);
    expect(events.some((e) => e.kind === "fault")).toBe(false);
    vi.useRealTimers();
  });
});

describe("SarvamStreamRecognizer — giving up", () => {
  it("gives up after bounded backoff rather than retrying forever", async () => {
    vi.useFakeTimers();
    const harness = driveRecognizer();
    harness.recognizer.start("en-IN", harness.listen);
    await settle();
    await exhaust(harness);

    expect(harness.sockets.length).toBeLessThanOrEqual(4);
    // It reached the service and lost it, which is not "unreachable".
    expect(harness.events).toContainEqual({
      kind: "fault",
      fault: "connection-lost",
    });
    vi.useRealTimers();
  });

  it("stops the microphone when it finally gives up", async () => {
    vi.useFakeTimers();
    const harness = driveRecognizer();
    harness.recognizer.start("en-IN", harness.listen);
    await settle();
    await exhaust(harness);

    expect(harness.capture.running).toBe(false);
    vi.useRealTimers();
  });
});

describe("SarvamStreamRecognizer — one thing listening at a time", () => {
  it("tears the previous socket and capture down before starting again", async () => {
    const { recognizer, listen, live, capture } = driveRecognizer();
    recognizer.start("en-IN", listen);
    await settle();
    recognizer.start("en-IN", listen);
    await settle();

    expect(live()).toHaveLength(1);
    expect(capture.stops).toBeGreaterThanOrEqual(1);
  });

  it("survives the stop() useVoiceInput fires from its own final handler", async () => {
    const { recognizer, listen, events, last } = driveRecognizer();
    const reentrant = (event: RecognizerEvent): void => {
      listen(event);
      if (event.kind === "final") recognizer.stop();
    };
    recognizer.start("en-IN", reentrant);
    await settle();
    last()?.accept();
    last()?.deliver({ event: "transcript.final", text: "done" });

    expect(events.filter((e) => e.kind === "stopped")).toHaveLength(1);
  });
});

describe("SarvamStreamRecognizer — the unsupported path", () => {
  it("is unsupported without a key, so the ladder can skip it", () => {
    expect(new SarvamStreamRecognizer({ apiKey: "" }).supports("hi-IN")).toBe(
      false,
    );
  });

  it("reports a denied microphone rather than opening a socket", async () => {
    const denied = new Error("no");
    denied.name = "NotAllowedError";
    const { recognizer, listen, events, sockets } = driveRecognizer(denied);
    recognizer.start("en-IN", listen);
    await settle();

    expect(sockets).toHaveLength(0);
    expect(events).toEqual([{ kind: "fault", fault: "permission-denied" }]);
  });
});
