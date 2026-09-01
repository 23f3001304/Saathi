import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * What a full-viewport dialog owes the keyboard: focus in on open and back
 * where it came from on close, Escape always, Tab that cycles inside rather
 * than wandering into the page underneath, and a body that does not scroll
 * behind it.
 *
 * The listener is bound on the document in the capture phase so a control
 * with its own key handling — the language `<select>` — cannot swallow
 * Escape and strand someone inside the surface.
 */
export function useModalSurface(
  surface: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const node = surface.current;
    if (node === null) return;
    const restore = focused();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.focus();

    const onKey = (event: KeyboardEvent): void => {
      handleKey(event, node, close.current);
    };
    document.addEventListener("keydown", onKey, true);
    return (): void => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = scroll;
      restore?.focus();
    };
  }, [surface]);
}

function focused(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : null;
}

function handleKey(
  event: KeyboardEvent,
  node: HTMLElement,
  close: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key === "Tab") trap(event, node);
}

function trap(event: KeyboardEvent, node: HTMLElement): void {
  const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    node.focus();
    return;
  }
  const active = focused();
  const leavingBackwards =
    event.shiftKey && (active === first || active === node);
  if (leavingBackwards) move(event, last);
  else if (!event.shiftKey && active === last) move(event, first);
}

function move(event: KeyboardEvent, target: HTMLElement): void {
  event.preventDefault();
  target.focus();
}
