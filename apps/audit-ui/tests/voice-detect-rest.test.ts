// The REST rung of detection, against a scripted transport: no network, no
// microphone, no key. Verified live before it was built — `language_code:
// "unknown"` transcribes and answers with the code it decided on.
import { describe, expect, it } from "vitest";
import type { AudioCapture } from "../src/voice/audioCapture.ts";
import type { LanguageChoice } from "../src/voice/detectedLanguage.ts";
import type { RecognizerEvent } from "../src/voice/ports.ts";
import { SarvamRecognizer } from "../src/voice/sarvamRecognizer.ts";
import type { FetchLike } from "../src/voice/sarvamContract.ts";

const capture: AudioCapture = {
  start: (): Promise<void> => Promise.resolve(),
  stop: (): Promise<Blob | null> =>
    Promise.resolve(new Blob([new Uint8Array(8)])),
  cancel: (): void => undefined,
};

function drive(payload: Record<string, unknown>, choice: LanguageChoice) {
  const asked: string[] = [];
  const events: RecognizerEvent[] = [];
  const send: FetchLike = (_url, init) => {
    const body = init.body as FormData;
    asked.push(String(body.get("language_code")));
    return Promise.resolve(new Response(JSON.stringify(payload)));
  };
  const recognizer = new SarvamRecognizer(
    { apiKey: "k", fetch: send },
    capture,
  );
  recognizer.start(choice, (event) => events.push(event));
  return { asked, events, recognizer };
}

/** The adapter transcribes after the recording resolves, over a few ticks. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SarvamRecognizer — asking Sarvam which language it was", () => {
  it("asks for detection when the shopper has not chosen", async () => {
    const { asked, recognizer } = drive({ transcript: "hello" }, "detect");
    await flush();
    recognizer.stop();
    await flush();

    expect(asked).toEqual(["unknown"]);
  });

  it("carries the detected code into the transcript it emits", async () => {
    const { events, recognizer } = drive(
      { transcript: "मुझे नीला कुर्ता चाहिए", language_code: "hi-IN" },
      "detect",
    );
    await flush();
    recognizer.stop();
    await flush();

    expect(events).toContainEqual({
      kind: "final",
      text: "मुझे नीला कुर्ता चाहिए",
      language: "hi-IN",
    });
  });
});

describe("SarvamRecognizer — when detection is not the question", () => {
  it("sends an explicit choice unchanged, because some people do know", async () => {
    const { asked, events, recognizer } = drive(
      { transcript: "vanakkam", language_code: "ta-IN" },
      "ta-IN",
    );
    await flush();
    recognizer.stop();
    await flush();

    expect(asked).toEqual(["ta-IN"]);
    expect(events).toContainEqual({
      kind: "final",
      text: "vanakkam",
      language: "ta-IN",
    });
  });

  it("reads the script itself when Sarvam reports nothing usable", async () => {
    const { events, recognizer } = drive(
      { transcript: "எனக்கு ஒரு சட்டை வேண்டும்", language_code: "unknown" },
      "detect",
    );
    await flush();
    recognizer.stop();
    await flush();

    expect(events).toContainEqual({
      kind: "final",
      text: "எனக்கு ஒரு சட்டை வேண்டும்",
      language: "ta-IN",
    });
  });
});
