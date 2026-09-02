import { useEffect } from "react";
import { prefersReducedMotion } from "./reduced.ts";

/**
 * One IntersectionObserver for the whole page. Sections declare
 * `data-reveal` (children add `--i` for the 38ms stagger) and this hook
 * flips each to `data-reveal="in"` the first time it crosses the fold.
 *
 * DECISION: a single document-level observer instead of a hook per element.
 * The page is static prose with ~40 revealable nodes; forty refs threaded
 * through section props would be wiring for its own sake, and one observer
 * is also the cheap option the brief's performance rules ask for.
 *
 * DECISION: the observer is backed by a rAF-throttled catch-up sweep. A
 * fast scroll can jump an element through the intersection band between
 * two observer samples, and a horizontally snapped card can sit outside
 * the viewport's x-range forever; either way the content would stay
 * invisible. The sweep reveals anything whose top has entered the page's
 * read line regardless of how it got there. Nothing may stay hidden.
 */
function reveal(el: HTMLElement, pending: Set<HTMLElement>): void {
  el.dataset.reveal = "in";
  pending.delete(el);
}

function sweep(pending: Set<HTMLElement>): void {
  const line = window.innerHeight * 0.96;
  // All reads, then all writes. Interleaving them forced a full reflow per
  // node (every dataset write invalidates layout, every rect read pays for
  // it), which on a page of large painted panels stalled scroll for whole
  // seconds. Batched, the sweep costs one layout however many nodes it has.
  const due = Array.from(pending).filter(
    (el) => el.getBoundingClientRect().top < line,
  );
  for (const el of due) {
    reveal(el, pending);
  }
}

export function useRevealAll(): void {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const pending = new Set(nodes);
    if (prefersReducedMotion()) {
      for (const el of nodes) el.dataset.reveal = "in";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          reveal(entry.target as HTMLElement, pending);
        }
      },
      { rootMargin: "0px 50% -10% 50%", threshold: 0 },
    );
    for (const el of nodes) io.observe(el);
    let raf = 0;
    const onScroll = (): void => {
      if (raf !== 0 || pending.size === 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sweep(pending);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    sweep(pending);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);
}
