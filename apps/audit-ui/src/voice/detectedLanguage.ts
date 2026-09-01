import { isVoiceLanguage, VOICE_LANGUAGES } from "./languages.ts";
import { DETECT, type LanguageChoice, type VoiceLanguage } from "./ports.ts";

/**
 * The shopper is not one language, and a picker that pins the agent to one is
 * the wrong shape for a product used in a country where people change script
 * mid-sentence. So the picker becomes a preference, not a cage: left on
 * "detect", the engine is asked to work out what it heard and the agent answers
 * in the same language it was spoken to.
 *
 * Verified live against Sarvam before building on it: `POST /speech-to-text`
 * with `language_code: "unknown"` transcribed Hindi audio correctly and
 * returned `language_code: "hi-IN"` — it detects, and it says what it decided,
 * which is the part that makes the reply answerable in kind.
 */
export { DETECT, type LanguageChoice } from "./ports.ts";

/** What Sarvam is asked when the shopper has not chosen for themselves. */
export const SARVAM_ANY = "unknown";

export function isDetect(choice: LanguageChoice): choice is typeof DETECT {
  return choice === DETECT;
}

/**
 * Unicode blocks for the scripts the picker offers. Used only to answer *back*
 * in the right voice — the transcript's own language is whatever the engine
 * reported, and this never overrides it.
 */
const SCRIPTS: ReadonlyArray<readonly [VoiceLanguage, RegExp]> = [
  ["bn-IN", /[ঀ-৿]/],
  ["gu-IN", /[઀-૿]/],
  ["ta-IN", /[஀-௿]/],
  ["te-IN", /[ఀ-౿]/],
  ["kn-IN", /[ಀ-೿]/],
  ["ml-IN", /[ഀ-ൿ]/],
  // Devanagari carries both Hindi and Marathi; Hindi is the safer read when
  // nothing else distinguishes them, and the engine's own answer wins anyway.
  ["hi-IN", /[ऀ-ॿ]/],
];

/** The language a reply should be spoken in, read from the reply itself. */
export function scriptLanguageOf(text: string): VoiceLanguage | null {
  for (const [language, block] of SCRIPTS) {
    if (block.test(text)) return language;
  }
  return null;
}

/** What the engine said it heard, when it said anything usable. */
export function reportedLanguage(value: unknown): VoiceLanguage | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return isVoiceLanguage(code) ? code : null;
}

/**
 * The language to speak a reply in: what the engine detected, else what the
 * reply's own script says, else the shopper's explicit choice, else English.
 * A mixed reply follows its Indic half — the agent answering half in Devanagari
 * and half in a British-English voice is the seam this exists to remove.
 */
export function speakingLanguage(
  reply: string,
  heard: VoiceLanguage | null,
  choice: LanguageChoice,
): VoiceLanguage {
  return (
    scriptLanguageOf(reply) ?? heard ?? (isDetect(choice) ? "en-IN" : choice)
  );
}

export const LANGUAGE_CHOICES: ReadonlyArray<{
  readonly code: LanguageChoice;
  readonly endonym: string;
}> = [
  { code: DETECT, endonym: "Detect" },
  ...VOICE_LANGUAGES.map((option) => ({
    code: option.code as LanguageChoice,
    endonym: option.endonym,
  })),
];
