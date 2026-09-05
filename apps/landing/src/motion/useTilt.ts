import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced.ts";

/** The pointer leans the planes: two variables in -1..1, one write per move,
 *  reset on leave. Touch never fires this, and the scroll drift covers it. */
export function useTilt(stage: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = stage.current;
    if (el === null || prefersReducedMotion()) return;
    let rect = el.getBoundingClientRect();
    const onEnter = (): void => { rect = el.getBoundingClientRect(); };
    const onMove = (e: PointerEvent): void => {
      el.style.setProperty("--px", (((e.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--py", (((e.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
    };
    const onLeave = (): void => { el.style.setProperty("--px", "0"); el.style.setProperty("--py", "0"); };
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [stage]);
}
