import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { lineFile, type Beat } from "./lines.ts";
import {
  OFF,
  shouldSpeak,
  spoken,
  toggled,
  type SoundState,
} from "./soundState.ts";

const KEY = "saathi.sound";
const LOOP = "/audio/loop.mp3";

type AudioRef = { current: HTMLAudioElement | null };

export interface ShowSound {
  readonly on: boolean;
  toggle(): void;
  speak(beat: Beat, n?: number, again?: boolean): void;
  /** One recorded line by its own file stem, said once unless asked again. */
  speakFile(stem: string, again?: boolean): void;
  /** Stop whatever is in the air and say this line from its own start. */
  interrupt(stem: string): void;
  /** Stop the voice. The loop under it keeps running. */
  hush(): void;
}

function file(stem: string): string {
  return `/voice/${stem}.mp3`;
}

/** The switch is remembered between visits; private mode simply forgets. */
function remembered(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

/* The room tone under the voices, made the first time the switch goes on.
   When the file is not there play() rejects, the element is dropped, and the
   show goes on in the voices alone. */
function startLoop(loop: AudioRef): void {
  if (loop.current === null) {
    loop.current = new Audio(LOOP);
    loop.current.loop = true;
    loop.current.volume = 0.32;
  }
  loop.current.play().catch(() => {
    loop.current = null;
  });
}

/* Cutting a play() off before it has settled rejects it. That rejection is
   the interruption working, so it is swallowed rather than retried. */
function cutTo(el: HTMLAudioElement, src: string): void {
  el.pause();
  el.src = src;
  el.currentTime = 0;
  el.play().catch(() => undefined);
}

/* One voice element with two ways in. `enqueue` waits its turn, which is
   what the seal wants. `interrupt` does not: it drops the waiting line,
   stops whatever is speaking, and starts this file from zero, which is what
   a line locked to a window in the scroll wants, in either direction. A
   missing file rejects play() and is dropped without a word. */
interface Voice {
  enqueue(src: string): void;
  interrupt(src: string): void;
  silence(): void;
}

function useVoice(): Voice {
  const voice = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);

  const playNext = useCallback((): void => {
    const next = queue.current.shift();
    if (next === undefined || voice.current === null) return;
    voice.current.src = next;
    voice.current.play().catch(() => playNext());
  }, []);

  const element = useCallback((): HTMLAudioElement => {
    if (voice.current === null) {
      voice.current = new Audio();
      voice.current.addEventListener("ended", playNext);
    }
    return voice.current;
  }, [playNext]);

  const enqueue = useCallback((src: string): void => {
    const el = element();
    queue.current.push(src);
    if (el.paused) playNext();
  }, [element, playNext]);

  const interrupt = useCallback((src: string): void => {
    queue.current = [];
    cutTo(element(), src);
  }, [element]);

  const silence = useCallback((): void => {
    voice.current?.pause();
    queue.current = [];
  }, []);

  return { enqueue, interrupt, silence };
}

type Stems = Pick<ShowSound, "speakFile" | "interrupt">;

/* The show speaks by file stem: the script names its own recordings. A stem
   given to `speakFile` waits its turn and is said once, unless the caller
   asks for it again (the seal). A stem given to `interrupt` belongs to a
   window in the scroll instead: it cuts off whatever is speaking, starts
   from zero, and is never counted, so coming back to the window says the
   line again. A stem heard with the switch off is not counted either, so
   switching the sound on mid show still speaks. */
function useStems(
  enqueue: (src: string) => void,
  cut: (src: string) => void,
  state: MutableRefObject<SoundState>,
): Stems {
  const said = useRef<Set<string>>(new Set());

  const speakFile = useCallback((stem: string, again = false): void => {
    if (!state.current.on) return;
    if (!again && said.current.has(stem)) return;
    said.current.add(stem);
    enqueue(file(stem));
  }, [enqueue, state]);

  const interrupt = useCallback((stem: string): void => {
    if (!state.current.on) return;
    cut(file(stem));
  }, [cut, state]);

  return { speakFile, interrupt };
}

export function useShowSound(): ShowSound {
  const [state, setState] = useState<SoundState>(OFF);
  const stateRef = useRef(state);
  const loop = useRef<HTMLAudioElement | null>(null);
  const { enqueue, interrupt, silence } = useVoice();
  const stems = useStems(enqueue, interrupt, stateRef);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { if (remembered()) setState((s) => (s.on ? s : toggled(s))); }, []);

  const speak = useCallback((beat: Beat, n = 0, again = false): void => {
    if (!shouldSpeak(stateRef.current, beat, again)) return;
    setState((s) => spoken(s, beat));
    enqueue(lineFile(beat, n));
  }, [enqueue]);

  /* The switch is read by the scroll loop, which can run before React has
     re-rendered, so the ref is moved here rather than a render later. */
  const toggle = useCallback((): void => {
    const next = toggled(stateRef.current);
    stateRef.current = next;
    setState(next);
    remember(next.on);
    if (!next.on) { loop.current?.pause(); silence(); return; }
    startLoop(loop);
  }, [silence]);

  return { on: state.on, toggle, speak, hush: silence, ...stems };
}
