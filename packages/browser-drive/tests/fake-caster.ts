import type { CastFrame, CastSettings, Caster } from "../src/ports.js";

/** A caster the test drives by hand: `push` delivers exactly one frame. */
export class FakeCaster implements Caster {
  started: CastSettings | null = null;
  stopped = 0;
  readonly acked: number[] = [];
  private sink: ((frame: CastFrame) => void) | null = null;

  start(
    settings: CastSettings,
    onFrame: (frame: CastFrame) => void,
  ): Promise<void> {
    this.started = settings;
    this.sink = onFrame;
    return Promise.resolve();
  }

  ack(frame: number): Promise<void> {
    this.acked.push(frame);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopped += 1;
    this.sink = null;
    return Promise.resolve();
  }

  push(frame: CastFrame): void {
    this.sink?.(frame);
  }

  get casting(): boolean {
    return this.sink !== null;
  }
}
