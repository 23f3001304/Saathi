import { describe, expect, it } from "vitest";
import { speechChunk } from "../src/voice/sarvamStreamEvents.ts";
import { driveSynthesizer } from "./support/streamHarness.ts";

const AUDIO = { type: "audio", data: { audio: "QUJD" } };
const FINAL = { type: "event", data: { event_type: "final" } };

describe("SarvamStreamSynthesizer — the handshake and the config frame", () => {
  it("authenticates by subprotocol and names bulbul:v3", () => {
    const { synth, listen, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);

    expect(last()?.protocols).toEqual(["api-subscription-key.test-key"]);
    const url = new URL(last()?.url ?? "");
    expect(url.pathname).toBe("/text-to-speech/ws");
    expect(url.searchParams.get("model")).toBe("bulbul:v3");
  });

  it("sends config, then the text, then a flush", () => {
    const { synth, listen, last } = driveSynthesizer();
    synth.speak("two kilos of rice", "hi-IN", listen);
    last()?.accept();

    const sent = (last()?.sent ?? []).map((raw) => JSON.parse(raw));
    expect(sent.map((frame) => frame.type)).toEqual([
      "config",
      "text",
      "flush",
    ]);
    expect(sent[0].data.language_code).toBe("hi-IN");
    expect(sent[1].data.text).toBe("two kilos of rice");
  });
});

describe("SarvamStreamSynthesizer — playing before the sentence is finished", () => {
  it("pushes the first chunk to the player without waiting for the last", () => {
    const { synth, listen, events, player, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    last()?.accept();
    last()?.deliver(AUDIO);

    expect(player.chunks).toHaveLength(1);
    expect(player.sealed).toBe(false);
    expect(events).toEqual([{ kind: "speaking" }]);
  });

  it("announces speaking exactly once however many chunks arrive", () => {
    const { synth, listen, events, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    last()?.accept();
    last()?.deliver(AUDIO);
    last()?.deliver(AUDIO);
    last()?.deliver(AUDIO);

    expect(events.filter((e) => e.kind === "speaking")).toHaveLength(1);
  });
});

describe("SarvamStreamSynthesizer — the lifecycle voice mode depends on", () => {
  it("waits for playback to drain before saying it is done", () => {
    const { synth, listen, events, player, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    last()?.accept();
    last()?.deliver(AUDIO);
    last()?.deliver(FINAL);

    // The generator has finished, but audio is still playing: the turn must
    // not be handed back yet.
    expect(player.sealed).toBe(true);
    expect(events.some((e) => e.kind === "done")).toBe(false);

    player.finish();
    expect(events.at(-1)).toEqual({ kind: "done" });
  });

  it("settles exactly once, even if the socket also closes after playback", () => {
    const { synth, listen, events, player, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    last()?.accept();
    last()?.deliver(AUDIO);
    last()?.deliver(FINAL);
    player.finish();
    player.finish();
    last()?.drop();

    expect(events.filter((e) => e.kind !== "speaking")).toEqual([
      { kind: "done" },
    ]);
  });
});

describe("SarvamStreamSynthesizer — settling exactly once", () => {
  it("settles once when playback fails instead of ending", () => {
    const { synth, listen, events, player, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    last()?.accept();
    last()?.deliver(AUDIO);
    player.fail();
    player.finish();

    expect(events.filter((e) => e.kind !== "speaking")).toEqual([
      { kind: "fault", fault: "failed" },
    ]);
  });
});

describe("SarvamStreamSynthesizer — cancelling", () => {
  it("reports nothing at all for an utterance that was cancelled", () => {
    const { synth, listen, events, player, last } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    last()?.accept();
    last()?.deliver(AUDIO);
    const socket = last();
    synth.cancel();
    socket?.deliver(FINAL);
    player.finish();

    // Being interrupted is not an ending: `onSettled` must not fire, or the
    // auto-resume loop would start listening on top of the barge-in.
    expect(events.filter((e) => e.kind !== "speaking")).toHaveLength(0);
  });

  it("closes the socket when cancelled, leaving no second voice", () => {
    const { synth, listen, live, player } = driveSynthesizer();
    synth.speak("hello", "en-IN", listen);
    synth.cancel();

    expect(live()).toHaveLength(0);
    expect(player.stops).toBeGreaterThanOrEqual(1);
  });

  it("replaces the previous utterance rather than overlapping it", () => {
    const { synth, listen, live } = driveSynthesizer();
    synth.speak("first", "en-IN", listen);
    synth.speak("second", "en-IN", listen);

    expect(live()).toHaveLength(1);
  });
});

describe("the streaming TTS wire format", () => {
  it("reads an audio chunk, the completion event, and an error", () => {
    expect(speechChunk(JSON.stringify(AUDIO))).toEqual({
      kind: "audio",
      audio: "QUJD",
    });
    expect(speechChunk(JSON.stringify(FINAL))).toEqual({ kind: "final" });
    expect(speechChunk('{"type":"error","data":{"message":"no"}}')).toEqual({
      kind: "error",
    });
  });

  it("does not crash on an unknown or malformed frame", () => {
    expect(speechChunk("{")).toBeNull();
    expect(speechChunk('{"type":"heartbeat"}')).toBeNull();
  });
});
