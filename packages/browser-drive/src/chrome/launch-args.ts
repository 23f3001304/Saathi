import type { LaunchRequest } from "../ports.js";

/**
 * The flags that would hollow out the sandbox, as data. `--no-sandbox` and
 * `--disable-setuid-sandbox` are the two everyone pastes from Stack Overflow
 * when Chrome will not start; they switch off Chrome's own process sandbox, so
 * a compromised renderer on a hostile checkout page is running as the user.
 * This package would rather fail to launch.
 */
export const FORBIDDEN_LAUNCH_ARGS: readonly string[] = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-gpu-sandbox",
  "--disable-seccomp-filter-sandbox",
  "--no-zygote",
  "--single-process",
  "--disable-web-security",
  "--allow-running-insecure-content",
  "--allow-file-access-from-files",
  "--disable-site-isolation-trials",
  "--disable-site-isolation-for-policy",
  "--load-extension",
  "--disable-extensions-except",
  "--remote-debugging-port",
  "--remote-debugging-address",
  "--remote-allow-origins",
  "--user-data-dir",
  "--profile-directory",
  "--disable-popup-blocking",
];

/** Feature names whose removal breaks the renderer/site boundary. */
export const SITE_ISOLATION_FEATURES: readonly string[] = [
  "isolateorigins",
  "site-per-process",
  "siteperprocess",
  "strictoriginisolation",
  "crossoriginopenerpolicy",
];

export class SandboxFlagError extends Error {
  constructor(readonly flag: string) {
    super(
      `Refusing to launch Chrome with "${flag}": it removes a sandbox boundary this session depends on. Fix the environment rather than the flag.`,
    );
    this.name = "SandboxFlagError";
  }
}

/**
 * Throws on the first flag that weakens the sandbox. Called on the args this
 * package builds *and* exported so a host that adds its own args cannot skip it.
 */
export function assertSandboxIntact(args: readonly string[]): void {
  for (const arg of args) {
    const forbidden = FORBIDDEN_LAUNCH_ARGS.find(
      (flag) => arg === flag || arg.startsWith(`${flag}=`),
    );
    if (forbidden !== undefined) {
      throw new SandboxFlagError(arg);
    }
    assertKeepsSiteIsolation(arg);
  }
}

function assertKeepsSiteIsolation(arg: string): void {
  if (!arg.toLowerCase().startsWith("--disable-features=")) {
    return;
  }
  const value = arg.slice("--disable-features=".length).toLowerCase();
  const broken = SITE_ISOLATION_FEATURES.find((feature) =>
    value.includes(feature),
  );
  if (broken !== undefined) {
    throw new SandboxFlagError(arg);
  }
}

/**
 * Chrome's own defaults from puppeteer already carry `--disable-extensions`,
 * `--disable-sync`, `--disable-background-networking` and `--password-store=basic`,
 * and notably do *not* carry `--no-sandbox`. These add the rest: a session that
 * phones nothing home and cannot be talked into saving a credential.
 */
export function sandboxArgs(request: LaunchRequest): readonly string[] {
  const args = [
    `--window-size=${request.windowWidth},${request.windowHeight}`,
    "--no-default-browser-check",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-client-side-phishing-detection",
    "--no-service-autorun",
    "--no-pings",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--metrics-recording-only",
    "--disable-sync",
    "--password-store=basic",
    "--use-mock-keychain",
    // Autofill and the password manager, off at the feature level as well as in
    // the profile preferences. Neither list touches site isolation.
    "--disable-features=AutofillServerCommunication,AutofillEnableAccountWalletStorage,AutofillEnablePaymentsMandatoryReauth,Translate,MediaRouter,OptimizationHints",
  ];
  assertSandboxIntact(args);
  return args;
}
