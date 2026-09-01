// What the full-screen surface is doing, and the words for it. Pure, so the
// orb's four states and the sentence a screen reader hears are the same
// decision made once rather than two lists that drift apart.

export type OrbPhase = "idle" | "listening" | "thinking" | "speaking";

export type SessionSignals = {
  readonly listening: boolean;
  /** A batch engine has stopped hearing and is still turning it into words. */
  readonly transcribing: boolean;
  /** The transcript is sent and the agent has not answered yet. */
  readonly awaiting: boolean;
  readonly speaking: boolean;
};

/**
 * Speaking wins over listening because barge-in leaves both true for a beat,
 * and an orb that flickers between two states during an interruption reads as
 * broken. Transcribing and awaiting are one state to the user: thinking.
 */
export function orbPhase(signals: SessionSignals): OrbPhase {
  if (signals.speaking) return "speaking";
  if (signals.listening) return "listening";
  if (signals.transcribing || signals.awaiting) return "thinking";
  return "idle";
}

const STATUS: Readonly<Record<OrbPhase, string>> = {
  idle: "Ready: tap the bloom and speak",
  listening: "Listening",
  thinking: "Working out what you said",
  speaking: "Speaking",
};

/** The state in words, for the live region and for anyone not watching. */
export function orbStatus(phase: OrbPhase): string {
  return STATUS[phase];
}

const TAP: Readonly<Record<OrbPhase, string>> = {
  idle: "Start listening",
  listening: "Stop listening and send",
  thinking: "Working out what you said",
  speaking: "Interrupt and speak",
};

/** The orb is a button; every phase names what pressing it would do. */
export function orbLabel(phase: OrbPhase): string {
  return TAP[phase];
}

export type SpokenParts = {
  readonly interim: string;
  readonly heard: string;
  readonly reply: string;
};

export type OrbLine = {
  readonly text: string;
  /** Quiet while it is still a guess; ink once it is what was actually said. */
  readonly tone: "quiet" | "ink";
};

/**
 * One line at a time. This is a hands-free surface — nobody is reading a
 * scrollback here, so the exchange on screen is whatever is currently being
 * said, by whichever of the two is saying it.
 */
export function currentLine(phase: OrbPhase, parts: SpokenParts): OrbLine {
  if (phase === "listening") return { text: parts.interim, tone: "quiet" };
  if (phase === "thinking") return { text: parts.heard, tone: "ink" };
  return { text: parts.reply === "" ? parts.heard : parts.reply, tone: "ink" };
}
