import { randomUUID } from "node:crypto";

import type { Clock, IdGenerator } from "@covenant/domain";
import type { Timer, TimerFactory } from "@covenant/gateway";

/**
 * The three determinism seams, resolved to the real world exactly once — in
 * the composition root, which is the only place `Date.now`, `randomUUID` and
 * `setTimeout` are allowed to exist (§2.0 ports, §2.8).
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIds implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
}

/** `unref`ed: an armed cool-off hold must not keep the process alive. */
export class NodeTimers implements TimerFactory {
  after(ms: number, run: () => void): Timer {
    const handle = setTimeout(run, ms);
    handle.unref();
    return { cancel: () => clearTimeout(handle) };
  }
}
