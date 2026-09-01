import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertSandboxIntact,
  FORBIDDEN_LAUNCH_ARGS,
  SandboxFlagError,
  sandboxArgs,
} from "../src/chrome/launch-args.js";
import {
  sessionPreferences,
  writeSessionPreferences,
} from "../src/chrome/profile-preferences.js";
import { isUnder, realProfileRoots } from "../src/session/sandbox-paths.js";
import { TmpSandboxFactory } from "../src/session/sandbox.js";

const REQUEST = {
  userDataDir: join(tmpdir(), "covenant-browse-test"),
  downloadDir: join(tmpdir(), "covenant-browse-test", "downloads"),
  surface: "native-window" as const,
  windowWidth: 1280,
  windowHeight: 900,
};

describe("launch flags", () => {
  it.each([
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu-sandbox",
    "--single-process",
    "--no-zygote",
    "--disable-web-security",
    "--allow-running-insecure-content",
    "--allow-file-access-from-files",
    "--disable-site-isolation-trials",
    "--load-extension=/tmp/evil",
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    "--user-data-dir=/home/dev/.config/google-chrome",
  ])("refuses to launch with %s", (flag) => {
    expect(() => assertSandboxIntact([flag])).toThrow(SandboxFlagError);
  });

  it.each([
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-features=SitePerProcess",
    "--disable-features=StrictOriginIsolation",
  ])("refuses to disable site isolation via %s", (flag) => {
    expect(() => assertSandboxIntact([flag])).toThrow(SandboxFlagError);
  });
});

describe("the args this package actually builds", () => {
  it("builds args that carry none of the forbidden flags", () => {
    const args = sandboxArgs(REQUEST);
    for (const forbidden of FORBIDDEN_LAUNCH_ARGS) {
      expect(
        args.some(
          (arg) => arg === forbidden || arg.startsWith(`${forbidden}=`),
        ),
      ).toBe(false);
    }
  });

  it("leaves site isolation intact in its own feature list", () => {
    expect(() => assertSandboxIntact(sandboxArgs(REQUEST))).not.toThrow();
  });

  it("turns off autofill and sizes the window the user will see", () => {
    const args = sandboxArgs(REQUEST).join(" ");
    expect(args).toContain("AutofillServerCommunication");
    expect(args).toContain("--window-size=1280,900");
  });

  it("names the offending flag, because the fix is the environment", () => {
    try {
      assertSandboxIntact(["--no-sandbox"]);
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as SandboxFlagError).flag).toBe("--no-sandbox");
      expect((error as Error).message).toContain("Fix the environment");
    }
  });
});

describe("session preferences", () => {
  it("disables Chrome's own password manager and autofill", () => {
    const prefs = sessionPreferences("/tmp/x/downloads") as Record<
      string,
      Record<string, unknown>
    >;
    expect(prefs["credentials_enable_service"]).toBe(false);
    expect(prefs["profile"]?.["password_manager_enabled"]).toBe(false);
    expect(prefs["autofill"]?.["enabled"]).toBe(false);
    expect(prefs["autofill"]?.["credit_card_enabled"]).toBe(false);
    expect(prefs["payments"]?.["can_make_payment_enabled"]).toBe(false);
    expect(prefs["signin"]?.["allowed"]).toBe(false);
  });

  it("writes them where a fresh Chrome profile reads them", () => {
    const factory = new TmpSandboxFactory();
    const sandbox = factory.create("prefs-test");
    try {
      const path = writeSessionPreferences(sandbox.path, sandbox.downloadDir);
      expect(path).toBe(join(sandbox.path, "Default", "Preferences"));
      const written = JSON.parse(readFileSync(path, "utf8")) as Record<
        string,
        Record<string, unknown>
      >;
      expect(written["profile"]?.["password_manager_enabled"]).toBe(false);
      expect(written["download"]?.["default_directory"]).toBe(
        sandbox.downloadDir,
      );
    } finally {
      sandbox.dispose();
    }
  });
});

describe("the throwaway profile directory", () => {
  it("lives under the OS temp dir, with a downloads folder inside it", () => {
    const sandbox = new TmpSandboxFactory().create("sess_abc");
    try {
      expect(isUnder(sandbox.path, tmpdir())).toBe(true);
      expect(existsSync(sandbox.path)).toBe(true);
      expect(isUnder(sandbox.downloadDir, sandbox.path)).toBe(true);
      expect(existsSync(sandbox.downloadDir)).toBe(true);
    } finally {
      sandbox.dispose();
    }
  });

  it("is a fresh directory per session", () => {
    const factory = new TmpSandboxFactory();
    const first = factory.create("sess_one");
    const second = factory.create("sess_two");
    try {
      expect(first.path).not.toBe(second.path);
    } finally {
      first.dispose();
      second.dispose();
    }
  });
});

describe("the profile is removed when the session ends", () => {
  it("is deleted on dispose, so nothing outlives the session", () => {
    const sandbox = new TmpSandboxFactory().create("sess_gone");
    writeSessionPreferences(sandbox.path, sandbox.downloadDir);
    sandbox.dispose();
    expect(existsSync(sandbox.path)).toBe(false);
  });

  it("strips path separators out of a hostile session id", () => {
    const sandbox = new TmpSandboxFactory().create("../../etc/passwd");
    try {
      expect(isUnder(sandbox.path, tmpdir())).toBe(true);
    } finally {
      sandbox.dispose();
    }
  });
});

describe("profile paths that must never be used", () => {
  it("refuses a root outside the OS temp dir", () => {
    expect(() => new TmpSandboxFactory(homedir())).toThrow(/temp|profile/i);
  });

  it("refuses a real browser profile, which is the whole point", () => {
    for (const root of realProfileRoots()) {
      expect(() => new TmpSandboxFactory(root)).toThrow();
    }
  });

  it("knows a real Chrome profile path when it sees one", () => {
    const chrome = resolve(
      homedir(),
      "AppData",
      "Local",
      "Google",
      "Chrome",
      "User Data",
      "Default",
    );
    const roots = realProfileRoots();
    expect(roots.some((root) => isUnder(chrome, root))).toBe(true);
  });
});
