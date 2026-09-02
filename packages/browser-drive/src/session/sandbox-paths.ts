import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

export class SandboxOutsideTmpError extends Error {
  constructor(readonly path: string) {
    super(
      `Refusing a browser profile at "${path}": a purchase session runs under ${tmpdir()} or not at all.`,
    );
    this.name = "SandboxOutsideTmpError";
  }
}

export class RealProfileError extends Error {
  constructor(
    readonly path: string,
    readonly profileRoot: string,
  ) {
    super(
      `Refusing a browser profile at "${path}": it is inside a real browser profile (${profileRoot}). The session would inherit cookies, saved passwords and autofill.`,
    );
    this.name = "RealProfileError";
  }
}

/**
 * Known real-browser profile roots. The check is belt-and-braces next to the
 * temp-dir rule — on Windows `os.tmpdir()` is *inside* the home directory
 * (`%LOCALAPPDATA%\Temp`), so "not under $HOME" is not a rule that can be
 * stated there. "Under the OS temp dir and not inside any of these" can.
 */
export function realProfileRoots(home: string = homedir()): readonly string[] {
  return [
    join(home, "AppData", "Local", "Google", "Chrome", "User Data"),
    join(home, "AppData", "Local", "Microsoft", "Edge", "User Data"),
    join(home, "AppData", "Local", "BraveSoftware"),
    join(home, "AppData", "Roaming", "Mozilla"),
    join(home, "Library", "Application Support", "Google", "Chrome"),
    join(home, "Library", "Application Support", "Firefox"),
    join(home, ".config", "google-chrome"),
    join(home, ".config", "chromium"),
    join(home, ".mozilla"),
  ].map((path) => resolve(path));
}

export function isUnder(path: string, root: string): boolean {
  const target = resolve(path);
  const base = resolve(root);
  if (process.platform === "win32") {
    const t = target.toLowerCase();
    const b = base.toLowerCase();
    return t === b || t.startsWith(b.endsWith(sep) ? b : b + sep);
  }
  return target === base || target.startsWith(base.endsWith(sep) ? base : base + sep);
}

export function assertSandboxPath(path: string): void {
  const target = resolve(path);
  if (!isUnder(target, tmpdir())) {
    throw new SandboxOutsideTmpError(target);
  }
  const profileRoot = realProfileRoots().find((root) => isUnder(target, root));
  if (profileRoot !== undefined) {
    throw new RealProfileError(target, profileRoot);
  }
}

/**
 * The persistent store's own gate. It trades the tmp-only rule for two that
 * matter as much here: never inside a real browser profile, and never at a
 * filesystem root, so a bad constant cannot make "purge" mean "the disk".
 * The root is a host-chosen constant, not client input; client-chosen text
 * only ever reaches the SESSION segment, hashed before it gets here.
 */
export function assertPersistentSandboxPath(path: string): void {
  const target = resolve(path);
  const profileRoot = realProfileRoots().find((root) => isUnder(target, root));
  if (profileRoot !== undefined) {
    throw new RealProfileError(target, profileRoot);
  }
  const parent = resolve(target, "..");
  if (parent === target) {
    throw new SandboxOutsideTmpError(target);
  }
}

