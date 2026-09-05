import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type MouseEvent,
} from "react";
import { Wordmark } from "../chrome/Wordmark.tsx";
import { Seal } from "../kolam/Seal.tsx";
import { Footer } from "../sections/Footer.tsx";
import { useSound } from "../sound/SoundContext.tsx";
import { activeIndex, puppetOf, type SealWindow } from "./activeLine.ts";
import { Begin, paintBegin } from "./Begin.tsx";
import { follow, UNMEASURED, type Measured } from "./bubble.ts";
import { CHOREOGRAPHY, SCROLL_VH } from "./choreography.ts";
import type { ObjectId, Tick } from "./contract.ts";
import { evaluate } from "./evaluate.ts";
import { requestedMode, showWindows, type ShowMode, type Span } from "./mode.ts";
import { Overlay, type Shown } from "./Overlay.tsx";
import { SCRIPT } from "./script.ts";
import { useScrollProgress } from "./useScrollProgress.ts";
import { flapMouth, useSpeaking } from "./useSpeaking.ts";
import { useStage, type StageSources } from "./useStage.ts";
import styles from "./ScrollShow.module.css";

/* The two pictures are built next door and loaded when they exist. These are
   lazy globs rather than plain dynamic imports because `tsc -b` type-checks
   a literal specifier even inside `import()`, and this half of the page has
   to compile while the other half is still being made. One file, one chunk. */
const SOURCES: StageSources = {
  film: import.meta.glob("../film/index.ts"),
  webgl: import.meta.glob("../webgl/index.ts"),
};

const TOUT_MS = 2000;
const NARRATION = SCRIPT.filter((line) => line.speaker === "narrator");

/** The page is also rendered without a browser, for the no-JS bake. */
function asked(): ShowMode {
  const browser = typeof window !== "undefined";
  return requestedMode(browser ? window.location.search : "");
}

function paintName(el: HTMLElement | null, progress: number, out: Span): void {
  if (el === null) return;
  const k = (progress - out.from) / (out.to - out.from);
  const shown = k <= 0 ? 1 : k >= 1 ? 0 : 1 - k;
  el.style.opacity = String(shown);
  el.style.visibility = shown === 0 ? "hidden" : "visible";
}

function paintSeal(
  el: HTMLElement | null,
  progress: number,
  seal: SealWindow | null,
): void {
  if (el === null || seal === null) return;
  el.hidden = progress < seal.from || progress >= seal.to;
}

export function ScrollShow(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLHeadingElement>(null);
  const begin = useRef<HTMLDivElement>(null);
  const seal = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const size = useRef<Measured>(UNMEASURED);
  const speaker = useRef<ObjectId | null>(null);
  const spoken = useRef(-1);
  const tries = useRef(0);
  const flap = useRef<(() => void) | null>(null);
  const given = useRef(false);
  const [shown, setShown] = useState<Shown>({ line: null, on: false });
  /* One clock for the whole page, settled when the picture answers. */
  const [windows, setWindows] = useState(() => showWindows(asked()));
  const { interrupt, speakFile } = useSound();

  const onPicture = useCallback((mode: ShowMode): void => {
    if (plate.current !== null) plate.current.hidden = true;
    setWindows(showWindows(mode));
  }, []);
  const stage = useStage(canvas, SOURCES, asked(), onPicture);
  useSpeaking(shown.on ? shown.line : null, stage);
  useEffect(() => () => flap.current?.(), []);
  /* New words, new card: the size the loop clamps against is due again. */
  useEffect(() => {
    size.current = UNMEASURED;
  }, [shown]);
  /* A new clock: the line the runtime thinks it is on is due again too. */
  useEffect(() => {
    spoken.current = -1;
  }, [windows]);

  const onTick = useCallback(
    (tick: Tick): void => {
      const live = stage.current;
      const frame = evaluate(CHOREOGRAPHY, tick.progress);
      if (live !== null) {
        live.apply(frame, tick);
        live.setNight(frame.night?.opacity ?? 0);
        follow(bubble.current, live, speaker.current, size);
      }
      paintName(name.current, tick.progress, windows.nameOut);
      paintBegin(begin.current, tick.progress, windows.beginUntil);
      paintSeal(seal.current, tick.progress, windows.seal);
      const script = windows.script;
      const i = activeIndex(script, tick.progress);
      if (i === spoken.current) return;
      spoken.current = i;
      if (i < 0) {
        setShown((was) => (was.on ? { line: was.line, on: false } : was));
        return;
      }
      speaker.current = puppetOf(script[i].speaker);
      setShown({ line: script[i], on: true });
    },
    [stage, windows],
  );
  useScrollProgress(onTick);

  /* The tout is the one thing on the picture you can touch. He says his
     next line every time, because being refused does not teach him. */
  const onCanvasClick = useCallback(
    (e: MouseEvent<HTMLCanvasElement>): void => {
      const live = stage.current;
      if (live === null || live.hitTest(e.clientX, e.clientY) !== "tout") return;
      const tout = windows.tout;
      interrupt(tout[tries.current % tout.length]);
      tries.current += 1;
      flap.current?.();
      flap.current = flapMouth(live, "tout", TOUT_MS);
    },
    [interrupt, stage, windows],
  );

  const onGiven = useCallback((): void => {
    given.current = true;
    if (seal.current !== null) seal.current.dataset.given = "true";
    if (windows.seal !== null) speakFile(windows.seal.voice, true);
  }, [speakFile, windows]);

  return (
    <>
      {/* Until the picture is up (and forever, with JavaScript off) the
          stage is a printed one: the proscenium on kraft, behind glass. */}
      <div className={styles.plate} ref={plate} aria-hidden="true">
        <img className={styles.printed} src="/stage/proscenium.webp" alt="" />
      </div>
      <canvas className={styles.canvas} ref={canvas} onClick={onCanvasClick} />

      <h1
        className={styles.name}
        ref={name}
        style={{ "--wordmark-delay": "900ms" } as CSSProperties}
      >
        <Wordmark mode="hero" />
      </h1>

      <Begin wrapRef={begin} />

      <Overlay shown={shown} last={windows.last} bubbleRef={bubble} />

      <div className={styles.seal} ref={seal} hidden>
        <Seal
          label="press and hold to give your word"
          doneLabel="your word, given"
          onComplete={onGiven}
        />
      </div>

      {/* The show in words, first in reading order, for a screen reader and
          for the page as it is served before any JavaScript runs. */}
      <div className={styles.visuallyHidden}>
        {NARRATION.map((line) => (
          <p key={line.id}>{line.text}</p>
        ))}
      </div>

      <div className={styles.scroll} style={{ height: `${SCROLL_VH}vh` }} />
      <Footer />
    </>
  );
}
