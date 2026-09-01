import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

import type { Clock } from "@covenant/domain";

import type { ElementDescriptor } from "../src/field/element-descriptor.js";
import type { Capture, Frame } from "../src/frame/frame-capture.js";
import type { Waiter } from "../src/ports.js";

export class FixedClock implements Clock {
  private ms = Date.parse("2026-08-31T09:00:00.000Z");

  now(): Date {
    this.ms += 1000;
    return new Date(this.ms);
  }
}

/** Resolves instantly so a 120-poll wait costs nothing in a test. */
export class InstantWaiter implements Waiter {
  readonly slept: number[] = [];

  sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    return Promise.resolve();
  }
}

const BLANK: ElementDescriptor = {
  selector: "#field",
  tag: "input",
  inputType: "text",
  name: null,
  id: null,
  autocomplete: null,
  placeholder: null,
  ariaLabel: null,
  labelText: null,
  nearbyText: null,
  inputMode: null,
  pattern: null,
  maxLength: null,
  text: null,
  formAction: null,
  pageUrl: "https://bazaar.example/products/trailfoot-runner",
};

export function el(overrides: Partial<ElementDescriptor>): ElementDescriptor {
  return { ...BLANK, ...overrides };
}

export function button(
  text: string,
  overrides: Partial<ElementDescriptor> = {},
): ElementDescriptor {
  return el({ tag: "button", inputType: null, text, ...overrides });
}

export const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "shop",
);

export function fixtureUrl(page: string): string {
  return pathToFileURL(resolve(FIXTURE_DIR, page)).href;
}

export * from "./fake-page.js";

/**
 * Unwraps a capture in tests that are about pixels. A blackout here means the
 * capture never happened, which those tests would otherwise report as a
 * confusing `undefined` rather than the thing that actually occurred.
 */
export function frameOf(capture: Capture): Frame {
  if (capture.kind === "blackout") {
    throw new Error(
      `Expected a frame, got a blackout (${capture.blackout.category}).`,
    );
  }
  return capture.frame;
}
