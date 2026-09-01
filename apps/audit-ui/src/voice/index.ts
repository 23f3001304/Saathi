// The dock imports from here and nowhere deeper: everything below is either a
// port, an adapter behind one, or the React surface that drives them.
export type {
  AmplitudeMeter,
  RecognizerEvent,
  RecognizerListener,
  SpeechRecognizer,
  SpeechSynthesizer,
  SynthesizerEvent,
  SynthesizerListener,
  VoiceFault,
  VoiceKit,
  VoiceLanguage,
} from "./ports.ts";

export { VoiceBar, type VoiceBarProps } from "./VoiceBar.tsx";
export { VoiceMode, type VoiceModeProps } from "./VoiceMode.tsx";
export { VoiceOrb } from "./VoiceOrb.tsx";
export { ComposerVoice, type ComposerVoiceProps } from "./ComposerVoice.tsx";
export { useComposerVoice } from "./useComposerVoice.ts";
export { useVoiceInput, type VoiceInput } from "./useVoiceInput.ts";
export { useSpokenReplies, type SpokenReplies } from "./useSpokenReplies.ts";
export {
  useVoiceSession,
  type VoiceSession,
  type VoiceSessionOptions,
} from "./useVoiceSession.ts";
export {
  currentLine,
  orbLabel,
  orbPhase,
  orbStatus,
  type OrbLine,
  type OrbPhase,
} from "./orbState.ts";
export {
  bloomPath,
  petalCount,
  petalLevels,
  pulliRing,
  ORB_SIZE,
  type OrbGeometry,
} from "./orbPath.ts";
export {
  BAR_COUNT,
  reduceVoice,
  IDLE,
  type VoicePhase,
  type VoiceState,
} from "./voiceMachine.ts";
export { createVoiceKit } from "./createVoice.ts";
export { DETECT, type LanguageChoice } from "./detectedLanguage.ts";
export {
  DEFAULT_LANGUAGE,
  isIndic,
  isVoiceLanguage,
  languageName,
  VOICE_LANGUAGES,
} from "./languages.ts";
export { faultSentence, isBenign } from "./messages.ts";
export { arcRadius, listeningPath, pulliPoints } from "./listeningPath.ts";
