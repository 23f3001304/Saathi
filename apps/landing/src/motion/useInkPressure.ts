import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced.ts";

/**
 * The hero's discoverable interaction: the name is still wet. Moving the
 * cursor across the wordmark presses weight into the letters under it, the
 * way a nib presses ink, and they spring back as it passes. Six spans, one
 * rAF, variable-font weight and a one-pixel sink: nothing here can jank.
 * Mouse and pen only; on touch and under reduced motion the name is dry.
 */
type Point = { x: number; y: number };

type InkState = {
  spots: Point[];
  cur: Point;
  target: Point;
  k: number;
  wantK: number;
  raf: number;
};

const BASE_WGHT = 540;
const AMP_WGHT = 190;
const SIGMA = 150;

function centers(letters: HTMLElement[]): Point[] {
  return letters.map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

function press(letters: HTMLElement[], at: Point[], p: Point, k: number): void {
  for (let i = 0; i < letters.length; i++) {
    const el = letters[i];
    const c = at[i];
    if (el === undefined || c === undefined) continue;
    const d = Math.hypot(p.x - c.x, (p.y - c.y) * 0.6);
    const g = Math.exp(-(d * d) / (2 * SIGMA * SIGMA)) * k;
    el.style.fontVariationSettings = `"opsz" 144, "wght" ${Math.round(BASE_WGHT + AMP_WGHT * g)}`;
    el.style.transform = `translateY(${(2.5 * g).toFixed(2)}px)`;
  }
}

function makeTick(letters: HTMLElement[], s: InkState): () => void {
  const tick = (): void => {
    s.cur.x += (s.target.x - s.cur.x) * 0.22;
    s.cur.y += (s.target.y - s.cur.y) * 0.22;
    s.k += (s.wantK - s.k) * 0.14;
    press(letters, s.spots, s.cur, s.k);
    s.raf = s.wantK > 0 || s.k > 0.01 ? requestAnimationFrame(tick) : 0;
  };
  return tick;
}

function attach(host: HTMLElement, letters: HTMLElement[]): () => void {
  const s: InkState = {
    spots: centers(letters),
    cur: { x: -9999, y: -9999 },
    target: { x: -9999, y: -9999 },
    k: 0,
    wantK: 0,
    raf: 0,
  };
  const tick = makeTick(letters, s);
  const wake = (): void => {
    if (s.raf === 0) s.raf = requestAnimationFrame(tick);
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    s.target = { x: e.clientX, y: e.clientY };
    s.wantK = 1;
    wake();
  };
  const onLeave = (): void => {
    s.wantK = 0;
    wake();
  };
  const onResize = (): void => {
    s.spots = centers(letters);
  };
  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerleave", onLeave, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  return () => {
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", onResize);
    if (s.raf !== 0) cancelAnimationFrame(s.raf);
  };
}

export function useInkPressure(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = ref.current;
    if (host === null || prefersReducedMotion()) return;
    const letters = Array.from(host.querySelectorAll<HTMLElement>("[data-letter]"));
    if (letters.length === 0) return;
    return attach(host, letters);
  }, [ref]);
}
