import type { CastFrame, CastSettings, Caster } from "@covenant/browser-drive";

/**
 * A screencast the test pushes frames into by hand. `ack` is recorded rather
 * than acted on, because the ack *is* the rate control: what the feed does
 * with it, and when, is the thing worth asserting.
 */
export class FakeCaster implements Caster {
  started: CastSettings | null = null;
  stops = 0;
  readonly acked: number[] = [];
  readonly ackAt: number[] = [];
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
    this.ackAt.push(Date.now());
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stops += 1;
    this.sink = null;
    return Promise.resolve();
  }

  get casting(): boolean {
    return this.sink !== null;
  }

  push(frame: CastFrame): void {
    this.sink?.(frame);
  }
}

/** A caster that will not start, for the fallback path. */
export class BrokenCaster implements Caster {
  start(): Promise<void> {
    return Promise.reject(new Error("Page.startScreencast: Target closed"));
  }
  ack(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
}

export function castFrameOf(
  ack: number,
  bytes: Uint8Array,
  navigation = 0,
): CastFrame {
  return {
    bytes,
    mediaType: "image/jpeg",
    ack,
    navigation,
    width: 320,
    height: 200,
  };
}
