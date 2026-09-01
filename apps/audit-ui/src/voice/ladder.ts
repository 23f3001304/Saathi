import type { LanguageChoice } from "./detectedLanguage.ts";
import type {
  RecognizerListener,
  VoiceFault,
  SpeechRecognizer,
  SpeechSynthesizer,
  SynthesizerListener,
  VoiceLanguage,
} from "./ports.ts";

/**
 * Streaming Sarvam, then REST Sarvam, then the browser's own engine. A rung
 * that cannot reach its transport steps aside for the next one *within the
 * same press*, so the user says a sentence once and gets a transcript, not an
 * error and an invitation to try again.
 *
 * Two rules keep the demotion honest. It only happens on a transport fault
 * (`network`) — a denied microphone is not something the next rung can fix,
 * and retrying it would just ask twice. And it only happens before the rung
 * has produced any speech: once words are on screen, a silent restart would
 * discard them, so the fault is reported instead.
 */
type Rung = { supports(language: LanguageChoice): boolean };

/** The faults the next rung might actually survive. A denied microphone is not one. */
function transport(fault: VoiceFault): boolean {
  return fault === "network" || fault === "connection-lost";
}

function usable<T extends Rung>(
  rungs: readonly T[],
  language: LanguageChoice,
  from: number,
  skip: ReadonlySet<number>,
): number {
  for (let i = from; i < rungs.length; i += 1) {
    if (!skip.has(i) && rungs[i].supports(language)) return i;
  }
  return -1;
}

export class LadderRecognizer implements SpeechRecognizer {
  readonly id = "ladder";

  private active: SpeechRecognizer | null = null;
  /** Rungs proven unreachable this session; not retried on every press. */
  private readonly dead = new Set<number>();

  constructor(private readonly rungs: readonly SpeechRecognizer[]) {}

  supports(language: LanguageChoice): boolean {
    return usable(this.rungs, language, 0, this.dead) !== -1;
  }

  start(language: LanguageChoice, listen: RecognizerListener): void {
    this.stop();
    this.climb(0, language, listen);
  }

  stop(): void {
    const active = this.active;
    this.active = null;
    active?.stop();
  }

  private climb(
    from: number,
    language: LanguageChoice,
    listen: RecognizerListener,
  ): void {
    const index = usable(this.rungs, language, from, this.dead);
    if (index === -1) {
      listen({ kind: "fault", fault: from === 0 ? "unsupported" : "network" });
      return;
    }
    const engine = this.rungs[index];
    this.active = engine;
    let spoke = false;
    engine.start(language, (event) => {
      if (event.kind === "interim" || event.kind === "final") spoke = true;
      if (event.kind === "fault" && transport(event.fault) && !spoke) {
        this.dead.add(index);
        this.climb(index + 1, language, listen);
        return;
      }
      listen(event);
    });
  }
}

export class LadderSynthesizer implements SpeechSynthesizer {
  readonly id = "ladder";

  private active: SpeechSynthesizer | null = null;
  private readonly dead = new Set<number>();

  constructor(private readonly rungs: readonly SpeechSynthesizer[]) {}

  supports(language: VoiceLanguage): boolean {
    return usable(this.rungs, language, 0, this.dead) !== -1;
  }

  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    this.cancel();
    this.climb(0, text, language, listen);
  }

  cancel(): void {
    const active = this.active;
    this.active = null;
    active?.cancel();
  }

  private climb(
    from: number,
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    const index = usable(this.rungs, language, from, this.dead);
    if (index === -1) {
      listen({ kind: "fault", fault: "network" });
      return;
    }
    const engine = this.rungs[index];
    this.active = engine;
    let started = false;
    engine.speak(text, language, (event) => {
      if (event.kind === "speaking") started = true;
      if (event.kind === "fault" && transport(event.fault) && !started) {
        this.dead.add(index);
        this.climb(index + 1, text, language, listen);
        return;
      }
      listen(event);
    });
  }
}
