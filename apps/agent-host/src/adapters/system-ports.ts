import { randomUUID } from "node:crypto";

import type { Clock, IdGenerator } from "@covenant/domain";

/**
 * The two determinism seams, resolved to the real world exactly once — in the
 * composition root, the only place `Date.now` and `randomUUID` may exist (§12).
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
