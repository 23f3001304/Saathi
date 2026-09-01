import type { VoiceLanguage } from "./ports.ts";

export type LanguageOption = {
  readonly code: VoiceLanguage;
  /** The language's own name, in its own script — how a speaker finds it. */
  readonly endonym: string;
  /** The Latin-script name, for anyone scanning the list in English. */
  readonly latin: string;
};

/**
 * English plus the eight Indic languages that both engines cover: Chrome's
 * recognition list and Sarvam's Bulbul voice list intersect here, so every
 * row in the picker can actually be spoken *and* heard. Languages only one
 * side supports are left out rather than offered and then quietly broken.
 */
export const VOICE_LANGUAGES: readonly LanguageOption[] = [
  { code: "en-IN", endonym: "English", latin: "English (India)" },
  { code: "hi-IN", endonym: "हिन्दी", latin: "Hindi" },
  { code: "bn-IN", endonym: "বাংলা", latin: "Bengali" },
  { code: "mr-IN", endonym: "मराठी", latin: "Marathi" },
  { code: "ta-IN", endonym: "தமிழ்", latin: "Tamil" },
  { code: "te-IN", endonym: "తెలుగు", latin: "Telugu" },
  { code: "kn-IN", endonym: "ಕನ್ನಡ", latin: "Kannada" },
  { code: "gu-IN", endonym: "ગુજરાતી", latin: "Gujarati" },
  { code: "ml-IN", endonym: "മലയാളം", latin: "Malayalam" },
];

export const DEFAULT_LANGUAGE: VoiceLanguage = "en-IN";

const CODES: ReadonlySet<string> = new Set(VOICE_LANGUAGES.map((l) => l.code));

export function isVoiceLanguage(value: string): value is VoiceLanguage {
  return CODES.has(value);
}

/** Which languages route to the Indic engine when one is configured. */
export function isIndic(language: VoiceLanguage): boolean {
  return language !== "en-IN";
}

export function languageName(language: VoiceLanguage): string {
  return VOICE_LANGUAGES.find((l) => l.code === language)?.latin ?? language;
}
