import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced.ts";
import { settled, step, tilt, type Spring } from "./stickSpring.ts";

/*
 * The visitor holds the stick. A pointer over the stage sets where the hand
 * is; the puppet follows on the spring and rocks with its own velocity. The
 * loop runs only while the spring is unsettled, writes two CSS variables and
 * reads the DOM once per pointer entry, so there is no read/write sweep.
 */
export function usePointerStick(stage: RefObject<HTMLElement>, stick: RefObject<HTMLElement>, restX: number): void {
  useEffect(() => {
    const el = stage.current;
    const puppet = stick.current;
    if (el === null || puppet === null || prefersReducedMotion()) return;
    let rect = el.getBoundingClientRect();
    let target = restX;
    let s: Spring = { x: restX, v: 0 };
    let frame = 0;
    let last = 0;

    const paint = (now: number): void => {
      s = step(s, target, last === 0 ? 16 : now - last);
      last = now;
      puppet.style.setProperty("--dx", `${((s.x - restX) / 100) * rect.width}px`);
      puppet.style.setProperty("--stick-rot", `${tilt(s.v)}deg`);
      frame = settled(s, target) ? 0 : requestAnimationFrame(paint);
      if (frame === 0) last = 0;
    };
    const wake = (): void => { if (frame === 0) frame = requestAnimationFrame(paint); };
    const onEnter = (): void => { rect = el.getBoundingClientRect(); };
    const onMove = (e: PointerEvent): void => {
      target = Math.min(92, Math.max(8, ((e.clientX - rect.left) / rect.width) * 100));
      wake();
    };
    const onLeave = (): void => { target = restX; wake(); };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [stage, stick, restX]);
}
