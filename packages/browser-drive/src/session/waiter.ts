import { setTimeout as delay } from "node:timers/promises";

import type { Waiter } from "../ports.js";

/** The real clock's waiter. Tests inject one that resolves immediately. */
export class TimerWaiter implements Waiter {
  async sleep(ms: number): Promise<void> {
    await delay(ms);
  }
}
