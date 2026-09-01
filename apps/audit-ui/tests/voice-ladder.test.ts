import { describe, expect, it } from "vitest";
import type {
  RecognizerEvent,
  RecognizerListener,
  SpeechRecognizer,
  SpeechSynthesizer,
  SynthesizerEvent,
  SynthesizerListener,
  VoiceLanguage,
} from "../src/voice/ports.ts";
import { LadderRecognizer, LadderSynthesizer } from "../src/voice/ladder.ts";

type Scripted = SpeechRecognizer & { started: number };

function scriptedRecognizer(
  script: (listen: RecognizerListener) => void,
  can = true,
): Scripted {
  const engine: Scripted = {
    id: "scripted",
    started: 0,
    supports: (): boolean => can,
    start: (_language: VoiceLanguage, listen: RecognizerListener): void => {
      engine.started += 1;
      script(listen);
    },
    stop: (): void => undefined,
  };
  return engine;
}

function scriptedSynth(
  script: (listen: SynthesizerListener) => void,
): SpeechSynthesizer & { spoke: number } {
  const engine = {
    id: "scripted",
    spoke: 0,
    supports: (): boolean => true,
    speak: (
      _t: string,
      _l: VoiceLanguage,
      listen: SynthesizerListener,
    ): void => {
      engine.spoke += 1;
      script(listen);
    },
    cancel: (): void => undefined,
  };
  return engine;
}

const drops = (listen: RecognizerListener): void =>
  listen({ kind: "fault", fault: "network" });

describe("the ladder — streaming, then REST, then the browser", () => {
  it("falls to the next rung when the socket never reaches the network", () => {
    const events: RecognizerEvent[] = [];
    const rest = scriptedRecognizer((listen) => {
      listen({ kind: "listening" });
      listen({ kind: "final", text: "two kilos of rice" });
    });
    new LadderRecognizer([scriptedRecognizer(drops), rest]).start(
      "hi-IN",
      (event) => events.push(event),
    );

    expect(rest.started).toBe(1);
    expect(events).toEqual([
      { kind: "listening" },
      { kind: "final", text: "two kilos of rice" },
    ]);
  });

  it("falls back after a connection is lost as well as never made", () => {
    const rest = scriptedRecognizer((listen) => listen({ kind: "listening" }));
    new LadderRecognizer([
      scriptedRecognizer((listen) =>
        listen({ kind: "fault", fault: "connection-lost" }),
      ),
      rest,
    ]).start("hi-IN", () => undefined);

    expect(rest.started).toBe(1);
  });
});

describe("the ladder — when demotion would be wrong", () => {
  it("does not demote once words are on screen — that would discard them", () => {
    const events: RecognizerEvent[] = [];
    const rest = scriptedRecognizer(() => undefined);
    new LadderRecognizer([
      scriptedRecognizer((listen) => {
        listen({ kind: "interim", text: "two kilos" });
        listen({ kind: "fault", fault: "network" });
      }),
      rest,
    ]).start("hi-IN", (event) => events.push(event));

    expect(rest.started).toBe(0);
    expect(events).toContainEqual({ kind: "fault", fault: "network" });
  });

  it("does not retry a denied microphone on the next rung", () => {
    const rest = scriptedRecognizer(() => undefined);
    new LadderRecognizer([
      scriptedRecognizer((listen) =>
        listen({ kind: "fault", fault: "permission-denied" }),
      ),
      rest,
    ]).start("hi-IN", () => undefined);

    expect(rest.started).toBe(0);
  });
});

describe("the ladder — remembering what is broken", () => {
  it("remembers a dead rung instead of stalling on it every press", () => {
    const stream = scriptedRecognizer(drops);
    const rest = scriptedRecognizer((listen) => listen({ kind: "listening" }));
    const ladder = new LadderRecognizer([stream, rest]);
    ladder.start("hi-IN", () => undefined);
    ladder.start("hi-IN", () => undefined);

    expect(stream.started).toBe(1);
    expect(rest.started).toBe(2);
  });

  it("reports unsupported when no rung can do the language at all", () => {
    const events: RecognizerEvent[] = [];
    const ladder = new LadderRecognizer([
      scriptedRecognizer(() => undefined, false),
      scriptedRecognizer(() => undefined, false),
    ]);

    expect(ladder.supports("hi-IN")).toBe(false);
    ladder.start("hi-IN", (event) => events.push(event));
    expect(events).toEqual([{ kind: "fault", fault: "unsupported" }]);
  });
});

describe("the ladder — speaking", () => {
  it("falls back to REST when the socket cannot be reached", () => {
    const events: SynthesizerEvent[] = [];
    const rest = scriptedSynth((listen) => {
      listen({ kind: "speaking" });
      listen({ kind: "done" });
    });
    new LadderSynthesizer([
      scriptedSynth((listen) => listen({ kind: "fault", fault: "network" })),
      rest,
    ]).speak("hi", "hi-IN", (event) => events.push(event));

    expect(rest.spoke).toBe(1);
    expect(events).toEqual([{ kind: "speaking" }, { kind: "done" }]);
  });

  it("does not restart a reply that already began speaking", () => {
    const events: SynthesizerEvent[] = [];
    const rest = scriptedSynth(() => undefined);
    new LadderSynthesizer([
      scriptedSynth((listen) => {
        listen({ kind: "speaking" });
        listen({ kind: "fault", fault: "network" });
      }),
      rest,
    ]).speak("hi", "hi-IN", (event) => events.push(event));

    expect(rest.spoke).toBe(0);
    // Exactly one settling event still reaches the turn-taking loop.
    expect(events.filter((e) => e.kind !== "speaking")).toHaveLength(1);
  });
});
