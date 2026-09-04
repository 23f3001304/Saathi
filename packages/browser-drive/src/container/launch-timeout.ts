import type { ChildProcess } from "node:child_process";
import type { Browser } from "puppeteer";

import { DockerUnavailableError } from "./docker-cli.js";

/** Chrome inside a cold container needs a moment before it answers CDP. */
const HANDSHAKE_TIMEOUT_MS = 45_000;
/** Enough of docker's own complaint to name the cause, never a whole log. */
const STDERR_KEPT = 600;

/**
 * A container that never comes up fails as a timeout on the pipe, which on its
 * own says nothing useful. Docker's own complaint arrives on stderr, so it is
 * kept and handed back as the reason — the difference between "it hung" and
 * "the image is not built here".
 */
export function withTimeout(
  pending: Promise<Browser>,
  child: ChildProcess,
): Promise<Browser> {
  let noise = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    noise = `${noise}${chunk.toString("utf8")}`.slice(-STDERR_KEPT);
  });
  const failed = new Promise<never>((_resolve, reject) => {
    const fail = (why: string): void => {
      reject(new DockerUnavailableError(`${why}: ${noise.trim()}`));
    };
    const timer = setTimeout(() => {
      fail("Chrome in the container never answered on the pipe");
    }, HANDSHAKE_TIMEOUT_MS);
    timer.unref();
    child.once("close", (code) => {
      clearTimeout(timer);
      fail(`the container exited with code ${String(code)}`);
    });
  });
  return Promise.race([pending, failed]);
}
