import type { VoiceFault } from "./ports.ts";

/**
 * One plain sentence per fault, written for the person holding the phone.
 * No error codes, no "something went wrong", and — where the user can fix it
 * themselves — the fix, because "permission denied" without "you can allow
 * it in the address bar" is just a dead end with better grammar.
 */
const SENTENCES: Readonly<Record<VoiceFault, string>> = {
  unsupported:
    "This browser can't listen. Chrome, Edge or Safari can — typing works here either way.",
  "permission-denied":
    "Microphone blocked. Allow it in the address bar, then press again.",
  "no-microphone": "No microphone found. Plug one in, or just type.",
  "no-speech": "Didn't catch that — press and speak again.",
  "language-unsupported":
    "This browser can't listen in that language yet. Try English, or type.",
  network: "Speech service unreachable. Typing still works.",
  "connection-lost":
    "Lost the live connection. Anything already heard was kept — press to carry on.",
  aborted: "Listening stopped.",
  failed: "Listening failed. Press to try again, or type.",
};

export function faultSentence(fault: VoiceFault): string {
  return SENTENCES[fault];
}

/** Faults the user caused on purpose, or that resolve by pressing again. */
const BENIGN: ReadonlySet<VoiceFault> = new Set<VoiceFault>([
  "no-speech",
  "aborted",
]);

export function isBenign(fault: VoiceFault): boolean {
  return BENIGN.has(fault);
}
