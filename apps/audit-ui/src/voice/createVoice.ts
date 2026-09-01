import { LadderRecognizer, LadderSynthesizer } from "./ladder.ts";
import { WebAudioAmplitudeMeter } from "./micAmplitude.ts";
import type { SpeechRecognizer, SpeechSynthesizer, VoiceKit } from "./ports.ts";
import { RoutedRecognizer, RoutedSynthesizer } from "./router.ts";
import type { SarvamConfig } from "./sarvamContract.ts";
import { SarvamRecognizer } from "./sarvamRecognizer.ts";
import { SarvamStreamRecognizer } from "./sarvamStreamRecognizer.ts";
import { SarvamStreamSynthesizer } from "./sarvamStreamSynthesizer.ts";
import { SarvamSynthesizer } from "./sarvamSynthesizer.ts";
import { WebSpeechRecognizer } from "./webSpeechRecognizer.ts";
import { WebSpeechSynthesizer } from "./webSpeechSynthesizer.ts";

/**
 * DECISION: `VITE_SARVAM_API_KEY` is a build-time value, which means it ships
 * inside the JS bundle and anyone can read it. That is acceptable for a demo
 * or a local run and is NOT acceptable in production — the production shape is
 * a gateway relay implementing the same two ports, which is why the ports
 * exist. Absent the variable, nothing about the dock changes: the browser
 * engines carry every language on their own.
 */
function sarvamKey(): string {
  const key = import.meta.env.VITE_SARVAM_API_KEY as string | undefined;
  return typeof key === "string" ? key.trim() : "";
}

/**
 * The Sarvam side of each port is itself a ladder: the streaming socket first,
 * the REST call behind it. `RoutedRecognizer` still decides *whether* Sarvam is
 * involved at all — that is a question about the language — and the ladder
 * decides how, which is a question about the network.
 */
function indicRecognizer(config: SarvamConfig | null): SpeechRecognizer | null {
  if (config === null) return null;
  return new LadderRecognizer([
    new SarvamStreamRecognizer(config),
    new SarvamRecognizer(config),
  ]);
}

function indicSynthesizer(
  config: SarvamConfig | null,
): SpeechSynthesizer | null {
  if (config === null) return null;
  return new LadderSynthesizer([
    new SarvamStreamSynthesizer(config),
    new SarvamSynthesizer(config),
  ]);
}

export function createVoiceKit(apiKey: string = sarvamKey()): VoiceKit {
  const config: SarvamConfig | null = apiKey === "" ? null : { apiKey };
  return {
    recognizer: new RoutedRecognizer(
      new WebSpeechRecognizer(),
      indicRecognizer(config),
    ),
    synthesizer: new RoutedSynthesizer(
      new WebSpeechSynthesizer(),
      indicSynthesizer(config),
    ),
    meter: new WebAudioAmplitudeMeter(),
  };
}
