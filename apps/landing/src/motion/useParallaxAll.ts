import { useEffect } from "react";
import { prefersReducedMotion } from "./reduced.ts";

/**
 * Depth for the brand symbols only: elements carrying `data-parallax`
 * (the Devanagari ghost, the watermark numerals, the Bakhshali zero)
 * drift against the page at their declared factor. One rAF-throttled
 * scroll listener, translate3d only, rebuilt on resize; under reduced
 * motion the layers simply hold still. Restraint everywhere else is what
 * lets these few moving layers read as depth instead of noise.
 */
type Item = { el: HTMLElement; factor: number; mid: number };

function buildItems(els: HTMLElement[]): Item[] {
  return els.map((el) => {
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    return {
      el,
      factor: Number(el.dataset.parallax) || 0.1,
      mid: r.top + window.scrollY + r.height / 2,
    };
  });
}

function applyItems(items: Item[]): void {
  const viewMid = window.scrollY + window.innerHeight / 2;
  for (const it of items) {
    const d = (viewMid - it.mid) * it.factor;
    it.el.style.transform = `translate3d(0, ${d.toFixed(1)}px, 0)`;
  }
}

export function useParallaxAll(): void {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]"),
    );
    if (els.length === 0) return;
    let items = buildItems(els);
    applyItems(items);
    let raf = 0;
    const onScroll = (): void => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyItems(items);
      });
    };
    // DECISION (replacing a ResizeObserver on body): the observer fed on its
    // own output. A translated layer near the page tail changes the body's
    // scroll height, the observer fires, the rebuild resets transforms and
    // re-applies them, the height changes again: a synchronous loop that
    // froze the renderer on first load. The viewport resizing is the only
    // resize this layout math actually depends on.
    const onResize = (): void => {
      items = buildItems(els);
      applyItems(items);
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);
}
