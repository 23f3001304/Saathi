import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Sandbox, SandboxFactory } from "../ports.js";
import { assertSandboxPath } from "./sandbox-paths.js";

const UNSAFE = /[^a-zA-Z0-9_-]/g;
const OWNER_ONLY = 0o700;

/**
 * Process-level, because crash cleanup is process-level: a Chrome profile that
 * outlives an aborted session is a directory of cookies and form state sitting
 * in temp. `exit` covers normal ends and uncaught exceptions; the signals do
 * not raise `exit` on their own, so they are registered too.
 */
class SandboxRegistry {
  private readonly live = new Set<Sandbox>();
  private hooked = false;

  track(sandbox: Sandbox): void {
    this.live.add(sandbox);
    this.hook();
  }

  release(sandbox: Sandbox): void {
    this.live.delete(sandbox);
  }

  disposeAll(): void {
    for (const sandbox of [...this.live]) {
      sandbox.dispose();
    }
  }

  private hook(): void {
    if (this.hooked) {
      return;
    }
    this.hooked = true;
    process.once("exit", () => {
      this.disposeAll();
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.once(signal, () => {
        this.disposeAll();
        process.exit(130);
      });
    }
  }
}

export const SANDBOX_REGISTRY = new SandboxRegistry();

/**
 * A throwaway Chrome profile per session, under the OS temp dir and nowhere
 * else, owner-only where the platform has POSIX modes, and deleted on close or
 * on process death. The constructor refuses any root outside `os.tmpdir()` and
 * any path inside a real browser profile, so the failure this guards against —
 * a purchase session opened against the user's own Chrome, with their cookies
 * and saved cards — is not reachable by passing a different string.
 */
export class TmpSandboxFactory implements SandboxFactory {
  private readonly root: string;

  constructor(root: string = tmpdir()) {
    this.root = resolve(root);
    assertSandboxPath(this.root);
  }

  create(sessionId: string): Sandbox {
    const path = resolve(this.root, `covenant-browse-${safe(sessionId)}`);
    assertSandboxPath(path);
    const downloads = join(path, "downloads");
    ownerOnlyDir(path);
    ownerOnlyDir(downloads);
    const sandbox: Sandbox = {
      path,
      downloadDir: downloads,
      dispose: () => {
        SANDBOX_REGISTRY.release(sandbox);
        rmSync(path, { recursive: true, force: true, maxRetries: 5 });
      },
    };
    SANDBOX_REGISTRY.track(sandbox);
    return sandbox;
  }
}

/** `mkdir` honours umask, so the mode is set again explicitly where it applies. */
function ownerOnlyDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: OWNER_ONLY });
  if (process.platform !== "win32") {
    chmodSync(path, OWNER_ONLY);
  }
}

function safe(sessionId: string): string {
  const cleaned = sessionId.replace(UNSAFE, "").slice(0, 64);
  return cleaned === "" ? "session" : cleaned;
}

export * from "./sandbox-paths.js";
