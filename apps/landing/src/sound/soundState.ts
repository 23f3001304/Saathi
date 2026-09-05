import type { Beat } from "./lines.ts";

export interface SoundState {
  readonly on: boolean;
  readonly spoken: ReadonlySet<Beat>;
}

export const OFF: SoundState = { on: false, spoken: new Set() };

export function toggled(s: SoundState): SoundState {
  return { on: !s.on, spoken: s.spoken };
}

export function spoken(s: SoundState, beat: Beat): SoundState {
  return { on: s.on, spoken: new Set([...s.spoken, beat]) };
}

/** Once per beat, unless the caller says again (the tout's tries). */
export function shouldSpeak(
  s: SoundState,
  beat: Beat,
  again = false,
): boolean {
  return s.on && (again || !s.spoken.has(beat));
}
