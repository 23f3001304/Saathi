/** One question, asked at interaction time so a mid-visit OS change is honoured. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
