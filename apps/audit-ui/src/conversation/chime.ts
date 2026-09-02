// One short two-tone ping, synthesized in place: no asset, no network. It
// sounds on the edge where a lane starts needing a person, whichever screen
// is up, because a background tab's badge is silent exactly when the shopper
// has stopped watching. Browsers gate audio behind a first user gesture, so
// the very first attention of a session may be silent; every one after the
// shopper has typed anything is not.
let held: AudioContext | null = null;

function ping(context: AudioContext, at: number, hz: number): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(at);
  osc.stop(at + 0.45);
}

export function chime(): void {
  try {
    held = held ?? new AudioContext();
    if (held.state === "suspended") {
      void held.resume();
    }
    const at = held.currentTime + 0.01;
    ping(held, at, 880);
    ping(held, at + 0.16, 1318);
  } catch {
    // No audio is a fine outcome; the badge and notification still stand.
  }
}
