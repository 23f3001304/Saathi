import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVoiceInput } from "../src/voice/useVoiceInput.ts";
import { FakeMeter, FakeRecognizer } from "./support/fakeVoice.ts";

type Sink = {
  onInterim: ReturnType<typeof vi.fn>;
  onFinal: ReturnType<typeof vi.fn>;
};

function setup(recognizer: FakeRecognizer, quiet = false) {
  const meter = new FakeMeter();
  const sink: Sink = { onInterim: vi.fn(), onFinal: vi.fn() };
  const view = renderHook(() =>
    useVoiceInput({
      recognizer,
      meter,
      language: "hi-IN",
      quiet,
      onInterim: sink.onInterim,
      onFinal: sink.onFinal,
    }),
  );
  return { ...view, meter, sink };
}

describe("useVoiceInput — the listening state machine", () => {
  it("walks idle → listening → interim → final → idle", () => {
    const recognizer = new FakeRecognizer();
    const { result, sink } = setup(recognizer);

    expect(result.current.phase).toBe("idle");

    act(() => result.current.start());
    expect(result.current.phase).toBe("listening");
    expect(recognizer.starts).toEqual(["hi-IN"]);

    act(() => recognizer.emit({ kind: "listening" }));
    expect(result.current.phase).toBe("listening");

    act(() => recognizer.emit({ kind: "interim", text: "do kilo" }));
    expect(sink.onInterim).toHaveBeenCalledWith("do kilo");
    expect(result.current.interim).toBe("do kilo");

    act(() => recognizer.emit({ kind: "final", text: "do kilo chawal" }));
    expect(sink.onFinal).toHaveBeenCalledWith("do kilo chawal");
    expect(result.current.phase).toBe("idle");
    expect(result.current.interim).toBe("");
  });

  it("a final result closes the microphone without being asked twice", () => {
    const recognizer = new FakeRecognizer();
    const { result, meter } = setup(recognizer);
    act(() => result.current.start());
    act(() => recognizer.emit({ kind: "final", text: "done" }));
    expect(recognizer.stops).toBeGreaterThan(0);
    expect(meter.stops).toBeGreaterThan(0);
  });

  it("permission denied becomes a blocked state, never a silent no-op", () => {
    const recognizer = new FakeRecognizer();
    const { result, sink } = setup(recognizer);
    act(() => result.current.start());
    act(() => recognizer.emit({ kind: "fault", fault: "permission-denied" }));

    expect(result.current.phase).toBe("blocked");
    expect(result.current.fault).toBe("permission-denied");
    expect(sink.onFinal).not.toHaveBeenCalled();
  });

  it("an engine that ends after failing does not erase the failure", () => {
    const recognizer = new FakeRecognizer();
    const { result } = setup(recognizer);
    act(() => result.current.start());
    act(() => recognizer.emit({ kind: "fault", fault: "no-microphone" }));
    act(() => recognizer.emit({ kind: "stopped" }));

    expect(result.current.phase).toBe("blocked");
    expect(result.current.fault).toBe("no-microphone");
  });

  it("an engine that cannot run here reports unsupported and refuses to start", () => {
    const recognizer = new FakeRecognizer(false);
    const { result } = setup(recognizer);

    expect(result.current.phase).toBe("unsupported");
    act(() => result.current.toggle());
    expect(recognizer.starts).toHaveLength(0);
  });

  it("'didn't catch that' stays usable rather than locking the control out", () => {
    const recognizer = new FakeRecognizer();
    const { result } = setup(recognizer);
    act(() => result.current.start());
    act(() => recognizer.emit({ kind: "fault", fault: "no-speech" }));

    expect(result.current.phase).toBe("idle");
    expect(result.current.fault).toBe("no-speech");
  });

  it("commits what was heard when the release beats the engine's own final", () => {
    const recognizer = new FakeRecognizer();
    const { result, sink } = setup(recognizer);
    act(() => result.current.start());
    act(() => recognizer.emit({ kind: "interim", text: "two kilos of rice" }));
    act(() => recognizer.emit({ kind: "stopped" }));

    expect(sink.onFinal).toHaveBeenCalledWith("two kilos of rice");
  });

  it("a batch engine's transcribing phase is distinct from listening", () => {
    const recognizer = new FakeRecognizer();
    const { result } = setup(recognizer);
    act(() => result.current.start());
    act(() => recognizer.emit({ kind: "transcribing" }));
    expect(result.current.phase).toBe("transcribing");
  });

  it("the waveform is fed by real samples, newest last", () => {
    const recognizer = new FakeRecognizer();
    const { result, meter } = setup(recognizer);
    act(() => result.current.start());
    expect(meter.starts).toBe(1);

    act(() => meter.emit(0.5));
    act(() => meter.emit(0.75));
    const levels = result.current.levels;
    expect(levels[levels.length - 1]).toBe(0.75);
    expect(levels[levels.length - 2]).toBe(0.5);
  });

  it("§3 reduced motion — the meter is never started rather than faked calm", () => {
    const recognizer = new FakeRecognizer();
    const { result, meter } = setup(recognizer, true);
    act(() => result.current.start());
    expect(meter.starts).toBe(0);
    expect(result.current.levels.every((l) => l === 0)).toBe(true);
  });

  it("unmounting closes the microphone", () => {
    const recognizer = new FakeRecognizer();
    const { result, unmount } = setup(recognizer);
    act(() => result.current.start());
    unmount();
    expect(recognizer.stops).toBeGreaterThan(0);
  });
});
