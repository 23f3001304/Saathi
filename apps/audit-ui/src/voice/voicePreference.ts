import { DETECT, type LanguageChoice } from "./detectedLanguage.ts";
import { isVoiceLanguage } from "./languages.ts";

const SPEAK_KEY = "saathi.voice.speakReplies";
const LANGUAGE_KEY = "saathi.voice.language";

/**
 * Safari in private mode throws on *reading* localStorage, not only on
 * writing, and an embedded WebView may have no storage at all. A lost
 * preference is a small annoyance; a dock that will not render because
 * storage was unavailable is a broken product, so every access is guarded
 * and every failure returns the default.
 */
function read(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Preference not remembered. The session still works exactly the same.
  }
}

/**
 * Default false, always. Auto-speaking on first load is the single most
 * disliked behaviour in voice UIs, so the absence of a stored preference
 * means silence — never "probably yes".
 */
export function readSpeakReplies(): boolean {
  return read(SPEAK_KEY) === "on";
}

export function writeSpeakReplies(enabled: boolean): void {
  write(SPEAK_KEY, enabled ? "on" : "off");
}

/**
 * Detect by default: a shopper who has not chosen has not thereby chosen
 * English, and asking the engine to work it out is the honest reading of an
 * absent preference. An explicit choice, once made, is remembered and obeyed.
 */
export function readLanguage(): LanguageChoice {
  const stored = read(LANGUAGE_KEY);
  if (stored === null) return DETECT;
  return isVoiceLanguage(stored) ? stored : DETECT;
}

export function writeLanguage(choice: LanguageChoice): void {
  write(LANGUAGE_KEY, choice);
}
