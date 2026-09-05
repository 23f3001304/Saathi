import { useEffect, type MutableRefObject } from "react";
import { useSound } from "../sound/SoundContext.tsx";
import { puppetOf } from "./activeLine.ts";
import type { ObjectId } from "./contract.ts";
import type { Line } from "./script.ts";
import type { StageLike } from "./stage.ts";

/*
 * A line is locked to its window in the scroll and to nothing else. The
 * window opens: whatever is speaking stops and this recording starts from
 * its own beginning. The window closes, or the reader scrolls into another
 * one: the recording stops. Nothing waits its turn, so scrolling back up
 * says the line again instead of playing a queue the reader has left.
 *
 * The jaw moves for as long as the recording lasts whether the sound is on
 * or not. A mouth that only moves for people with the sound up is a mouth
 * that never moves, because the switch starts off.
 */

const FLAP_MS = 110;

/** Opens and closes a mouth until the line is done. Returns the way to stop. */
export function flapMouth(
  stage: StageLike | null,
  id: ObjectId,
  ms: number,
): () => void {
  if (stage === null) return () => undefined;
  const until = performance.now() + ms;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let open = false;
  const step = (): void => {
    if (performance.now() >= until) {
      stage.setMouth(id, false);
      return;
    }
    open = !open;
    stage.setMouth(id, open);
    timer = setTimeout(step, FLAP_MS);
  };
  step();
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    stage.setMouth(id, false);
  };
}

export function useSpeaking(
  line: Line | null,
  stage: MutableRefObject<StageLike | null>,
): void {
  const { interrupt, hush } = useSound();
  useEffect(() => {
    if (line === null) return;
    interrupt(line.voice);
    const id = puppetOf(line.speaker);
    const stopFlap =
      id === null ? null : flapMouth(stage.current, id, line.seconds * 1000);
    return () => {
      hush();
      stopFlap?.();
    };
  }, [line, interrupt, hush, stage]);
}
