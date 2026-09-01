import type { Logger } from "@covenant/domain";

export interface ShutdownSteps {
  /** Stop accepting new connections. */
  stopAccepting(): Promise<void>;
  /** Wait for the in-flight purchase, so no cart is stranded mid-verdict. */
  settleRun(): Promise<void>;
  /** Drop every SSE subscriber so no socket outlives the process. */
  closeStreams(): void;
  /** Close the model session, which may hold a child process. */
  closeSession(): Promise<void>;
}

/**
 * Stop accepting → let the running purchase finish → close streams → close the
 * session. The order matters at exactly one point: a run that has already
 * called `execute-payment` must be allowed to read the answer, because the
 * money has moved and the only remaining question is whether anyone finds out.
 */
export class GracefulShutdown {
  private started = false;

  constructor(
    private readonly steps: ShutdownSteps,
    private readonly logger: Logger,
    private readonly timeoutMs: number,
  ) {}

  get draining(): boolean {
    return this.started;
  }

  async run(signal: string): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    const began = Date.now();
    await this.steps.stopAccepting();
    const settled = await this.settle();
    this.steps.closeStreams();
    await this.steps.closeSession();
    this.logger.info("shutdown.drain", {
      signal,
      run_settled: settled,
      ms: Date.now() - began,
    });
  }

  /** A wedged model call must not hold the process open forever. */
  private async settle(): Promise<boolean> {
    let timer: NodeJS.Timeout | null = null;
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.timeoutMs);
      timer.unref();
    });
    const settled = await Promise.race([
      this.steps.settleRun().then(() => true),
      deadline,
    ]);
    if (timer !== null) {
      clearTimeout(timer);
    }
    return settled;
  }
}
