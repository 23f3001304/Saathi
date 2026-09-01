// A stand-in for the browser's SpeechRecognition object. Constructed through
// a function so the test can hold the instance the adapter built, without the
// adapter having to expose it.
import type {
  SpeechRecognitionCtor,
  SpeechRecognitionLike,
  SpeechResultEventLike,
} from "../../src/voice/webSpeechTypes.ts";

export type FakeEngine = SpeechRecognitionLike & { starts: number };

function makeEngine(failStart: boolean): FakeEngine {
  const engine: FakeEngine = {
    lang: "",
    continuous: true,
    interimResults: false,
    maxAlternatives: 0,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    starts: 0,
    start: (): void => {
      if (failStart) throw new Error("already started");
      engine.starts += 1;
      engine.onstart?.();
    },
    stop: (): void => engine.onend?.(),
    abort: (): void => undefined,
  };
  return engine;
}

/**
 * `new Ctor()` returns the plain object pushed into `engines` — a constructor
 * that returns an object yields that object, which keeps the fake free of
 * classes and of `this`.
 */
export function fakeEngineCtor(
  engines: FakeEngine[],
  failStart = false,
): SpeechRecognitionCtor {
  return function FakeRecognition() {
    const engine = makeEngine(failStart);
    engines.push(engine);
    return engine;
  } as unknown as SpeechRecognitionCtor;
}

export function resultEvent(
  transcript: string,
  isFinal: boolean,
): SpeechResultEventLike {
  return {
    resultIndex: 0,
    results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } },
  };
}
