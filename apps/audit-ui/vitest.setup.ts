import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL's built-in auto-cleanup detects a *global* afterEach; this project
// imports test globals explicitly instead of enabling `test.globals`, so
// cleanup is wired up by hand — otherwise each render() leaks into the next
// test's DOM.
afterEach(cleanup);

// jsdom implements neither matchMedia nor SubtleCrypto. The reduced-motion
// hook and the Digest Inspector both need them, so the test environment
// gets the same primitives a real browser provides.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

// The live-transport suite runs under `@vitest-environment node`, where there
// is no window to patch at all.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}
