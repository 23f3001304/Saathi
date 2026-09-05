import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { ShowMode } from "./mode.ts";
import type { StageLike, StageModule, StageModules } from "./stage.ts";

/*
 * The picture's life: pick one, load it, build it on the canvas, wait for
 * it to be ready, keep it the size of the window, and put it down on the
 * way out. The page is written so that all of this can fail quietly. If
 * neither half is there, the fallback plate stays up and the words run.
 *
 * Two pictures can answer: the film next door and the built stage in
 * ../webgl. The film is asked first; when it says there is nothing to play
 * the stage takes the same canvas, and the runtime is told which one won so
 * the script can be read on that picture's clock.
 */

export interface StageSources {
  readonly film: StageModules;
  readonly webgl: StageModules;
}

interface Opened {
  readonly stage: StageLike;
  readonly mode: ShowMode;
}

function fit(stage: StageLike): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  stage.resize(window.innerWidth, window.innerHeight, dpr);
}

/** Loads one picture, builds it, and waits for its paper to arrive. */
async function build(
  canvas: HTMLCanvasElement,
  modules: StageModules,
): Promise<StageLike | null> {
  const load: (() => Promise<unknown>) | undefined = Object.values(modules)[0];
  if (load === undefined) return null;
  const mod = (await load().catch(() => null)) as StageModule | null;
  if (mod === null || mod.Stage === undefined) return null;
  let made: StageLike | null = null;
  try {
    made = new mod.Stage(canvas);
    await made.ready;
    return made;
  } catch {
    made?.dispose();
    return null;
  }
}

/** The film if it is asked for and it is there, the built stage if not. */
async function open(
  canvas: HTMLCanvasElement,
  sources: StageSources,
  want: ShowMode,
): Promise<Opened | null> {
  if (want === "film") {
    const film = await build(canvas, sources.film);
    if (film !== null) return { stage: film, mode: "film" };
  }
  const stage = await build(canvas, sources.webgl);
  return stage === null ? null : { stage, mode: "stage" };
}

export function useStage(
  canvasRef: RefObject<HTMLCanvasElement>,
  sources: StageSources,
  want: ShowMode,
  onReady: (mode: ShowMode) => void,
): MutableRefObject<StageLike | null> {
  const stage = useRef<StageLike | null>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let live = true;
    const onResize = (): void => {
      if (stage.current !== null) fit(stage.current);
    };
    void open(canvas, sources, want).then((opened) => {
      if (opened === null) return;
      if (!live) return opened.stage.dispose();
      stage.current = opened.stage;
      fit(opened.stage);
      window.addEventListener("resize", onResize);
      ready.current(opened.mode);
    });
    return () => {
      live = false;
      window.removeEventListener("resize", onResize);
      stage.current?.dispose();
      stage.current = null;
    };
  }, [canvasRef, sources, want]);

  return stage;
}
