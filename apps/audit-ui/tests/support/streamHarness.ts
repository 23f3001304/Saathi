import type {
  RecognizerEvent,
  SynthesizerEvent,
} from "../../src/voice/ports.ts";
import { SarvamStreamRecognizer } from "../../src/voice/sarvamStreamRecognizer.ts";
import { SarvamStreamSynthesizer } from "../../src/voice/sarvamStreamSynthesizer.ts";
import { fakeCapture, fakePlayer, fakeSockets } from "./fakeSocket.ts";

export const CONFIG = { apiKey: "test-key" };

export function driveRecognizer(captureFails?: Error) {
  const { connect, sockets, live } = fakeSockets();
  const capture = fakeCapture(captureFails);
  const events: RecognizerEvent[] = [];
  const recognizer = new SarvamStreamRecognizer(CONFIG, capture, connect);
  const listen = (event: RecognizerEvent): void => {
    events.push(event);
  };
  return {
    recognizer,
    listen,
    events,
    sockets,
    capture,
    live,
    last: () => sockets.at(-1),
  };
}

export function driveSynthesizer() {
  const { connect, sockets, live } = fakeSockets();
  const player = fakePlayer();
  const events: SynthesizerEvent[] = [];
  const synth = new SarvamStreamSynthesizer(CONFIG, player, connect);
  const listen = (event: SynthesizerEvent): void => {
    events.push(event);
  };
  return {
    synth,
    listen,
    events,
    player,
    sockets,
    live,
    last: () => sockets.at(-1),
  };
}

/** The recogniser opens its socket after the async capture start resolves. */
export async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
