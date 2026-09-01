import type { ChildProcess } from "node:child_process";

/**
 * Chrome's CDP pipe protocol: UTF-8 JSON messages, each terminated by a NUL.
 * Chrome reads them on fd 3 and writes them on fd 4; the container entrypoint
 * wires those two to its own stdin and stdout, so the host end of the pipe is
 * the ordinary stdio of a `docker run` child process.
 */
const TERMINATOR = 0;

/** The shape puppeteer's `connect({ transport })` expects. */
export interface CdpTransport {
  send(message: string): void;
  close(): void;
  onmessage?: (message: string) => void;
  onclose?: () => void;
}

export class PipeClosedError extends Error {
  constructor() {
    super(
      "The sandbox container's pipe is closed. Its Chrome is gone, and this session has no other way to reach it — there is no port to reconnect to, by design.",
    );
    this.name = "PipeClosedError";
  }
}

/**
 * The whole transport, and the reason this design has no debugging port.
 *
 * DECISION: a pipe over the container's stdio rather than `--remote-debugging-port`
 * published to the host. A CDP port is unauthenticated by construction — anything
 * that can open a socket to it drives the browser completely — so publishing one
 * would mean the sandbox's only real boundary was that nobody guessed the port.
 * `FORBIDDEN_LAUNCH_ARGS` already refuses that flag on the native surface; this
 * keeps the same promise in a container, where the honest statement is stronger:
 * the container listens on nothing, so there is no address for a second session,
 * another process, or a hostile page inside this very browser to aim at.
 */
export class ContainerPipe implements CdpTransport {
  onmessage?: (message: string) => void;
  onclose?: () => void;
  private pending = Buffer.alloc(0);
  private closed = false;

  constructor(private readonly child: ChildProcess) {
    child.stdout?.on("data", (chunk: Buffer) => {
      this.receive(chunk);
    });
    child.once("close", () => {
      this.finish();
    });
  }

  send(message: string): void {
    if (this.closed) {
      throw new PipeClosedError();
    }
    this.child.stdin?.write(`${message}\0`);
  }

  close(): void {
    this.finish();
  }

  private receive(chunk: Buffer): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    for (;;) {
      const end = this.pending.indexOf(TERMINATOR);
      if (end === -1) {
        return;
      }
      const message = this.pending.subarray(0, end).toString("utf8");
      this.pending = this.pending.subarray(end + 1);
      this.onmessage?.(message);
    }
  }

  private finish(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // Dropped rather than flushed: a half-message left when Chrome died is not
    // a message, and handing a truncated frame to the CDP parser would turn a
    // clean shutdown into a protocol error nobody can act on.
    this.pending = Buffer.alloc(0);
    this.onclose?.();
  }
}
