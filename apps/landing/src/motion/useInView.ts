import { useEffect } from "react";
import { prefersReducedMotion } from "./reduced.ts";

/**
 * The page's one piece of scroll-reactive JavaScript. An IntersectionObserver
 * marks each [data-s] element the first time it enters; CSS does the rest.
 * No scroll listeners, no rAF loops, no ResizeObservers: the previous page
 * carried four such systems and froze twice from their interactions.
 */
export function useInView(): void {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-s]"));
    if (prefersReducedMotion()) {
      for (const el of nodes) el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          e.target.classList.add("in");
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    for (const el of nodes) io.observe(el);
    return () => io.disconnect();
  }, []);
}
