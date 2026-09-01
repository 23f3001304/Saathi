import { useCallback, useEffect, useRef } from "react";
import { createTurnEndDetector, type TurnEndDetector } from "./turnEnd.ts";
import { createTurnGuess, type TurnGuess } from "./turnGuess.ts";

/**
 * Hands-free turn-taking: hold what the recogniser called final until the
 * thought is actually finished, then send it as one line.
 *
 * The grace timer is the safety rail and the reason this is safe to ship. If
 * the detector says "not finished" and the shopper has in fact stopped —
 * because they trailed off, or the model was wrong — the buffer is sent anyway.
 * The worst case is a short pause, never a swallowed sentence.
 */
const GRACE_MS = 2500;

/** One detector for the session; a new identity per render would abandon a
 *  decision already in flight. */
export function useDetector(
  injected: TurnEndDetector | undefined,
): TurnEndDetector {
  const held = useRef<TurnEndDetector | null>(null);
  if (injected !== undefined) return injected;
  held.current ??= createTurnEndDetector();
  return held.current;
}

export type TurnBuffer = {
  /** Feed a partial transcript, so the decision is ready before it is needed. */
  readonly observe: (interim: string) => void;
  /** Feed a final transcript. Returns nothing; `onTurn` fires when it is done. */
  readonly push: (text: string) => void;
  /** Send whatever is held right now — the shopper pressed stop. */
  readonly flush: () => void;
  readonly clear: () => void;
};

type Held = {
  readonly text: { current: string };
  readonly disarm: () => void;
  readonly send: () => void;
  readonly hold: (fire: () => void) => void;
};

function useHeld(onTurn: (text: string) => void): Held {
  const text = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onTurn);
  useEffect(() => {
    latest.current = onTurn;
  });

  const disarm = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const send = useCallback((): void => {
    disarm();
    const said = text.current.trim();
    text.current = "";
    if (said !== "") latest.current(said);
  }, [disarm]);

  const hold = useCallback((fire: () => void): void => {
    timer.current = setTimeout(fire, GRACE_MS);
  }, []);

  useEffect(() => disarm, [disarm]);
  return { text, disarm, send, hold };
}

function useGuess(detector: TurnEndDetector): TurnGuess {
  const held = useRef<TurnGuess | null>(null);
  held.current ??= createTurnGuess(detector);
  return held.current;
}

function useClear(parts: {
  disarm: () => void;
  guess: TurnGuess;
  text: { current: string };
}): () => void {
  const { disarm, guess, text } = parts;
  return useCallback((): void => {
    disarm();
    guess.reset();
    text.current = "";
  }, [disarm, guess, text]);
}

export function useTurnBuffer(
  detector: TurnEndDetector,
  onTurn: (text: string) => void,
): TurnBuffer {
  const { text, disarm, send, hold } = useHeld(onTurn);
  const guess = useGuess(detector);
  const parts = { disarm, guess, text };

  const settle = useCallback(
    (pending: string, done: boolean): void => {
      // A later push already superseded this decision; let that one decide.
      if (text.current !== pending) return;
      if (done) send();
      else hold(send);
    },
    [hold, send, text],
  );

  const push = useCallback(
    (said: string): void => {
      disarm();
      text.current = join(text.current, said);
      const pending = text.current;
      // Usually already answered while the shopper was still trailing off.
      const early = guess.verdict(pending);
      if (early !== undefined) {
        guess.reset();
        settle(pending, early);
        return;
      }
      void detector.complete(pending).then((done) => settle(pending, done));
    },
    [detector, disarm, guess, settle, text],
  );

  return { observe: guess.observe, push, flush: send, clear: useClear(parts) };
}

function join(held: string, next: string): string {
  const addition = next.trim();
  if (held === "") return addition;
  if (addition === "") return held;
  return `${held} ${addition}`;
}

/**
 * Partials reach the guess only on the hands-free surface. In the row the
 * shopper presses send, so there is no turn to end and nothing to predict.
 */
export function heardInterim(
  latest: { current: { hands: boolean; onInterim: (text: string) => void } },
  turn: TurnBuffer,
): (text: string) => void {
  return (text: string): void => {
    if (latest.current.hands) turn.observe(text);
    latest.current.onInterim(text);
  };
}
