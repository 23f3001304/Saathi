import { fileURLToPath } from "node:url";

import { isUnder } from "../session/sandbox-paths.js";

export interface NavigationPolicyConfig {
  /** Absolute directories `file://` navigation may target. Empty means none. */
  readonly fileRoots: readonly string[];
  /** When non-empty, an http(s) host must match one of these. */
  readonly allowHosts: readonly string[];
  readonly denyHosts: readonly string[];
}

/**
 * Disk-closed, web-open: no `file://` root is trusted, and any http(s) host is
 * reachable. Naming it for what it permits rather than "default" keeps the
 * empty `allowHosts` from reading as "nothing is allowed" — an empty allowlist
 * means *unscoped*, and a host allowlist is what scopes a session to one shop.
 */
export const WEB_ONLY_NAVIGATION: NavigationPolicyConfig = {
  fileRoots: [],
  allowHosts: [],
  denyHosts: [],
};

export type NavigationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly rule: string; readonly human: string };

const ALLOWED_SCHEMES: readonly string[] = ["http:", "https:", "file:"];

/**
 * Blast radius, as a value the host controls. `chrome://` and `about:` reach
 * browser internals — settings, saved passwords, the profile itself — which is
 * exactly the surface a prompt-injected agent would be steered at, and none of
 * it is a shop. `file://` is refused outside the roots the host names, so
 * "read the user's disk" is not one navigation away either.
 *
 * This is deliberately separate from `FieldClassifier`: that one decides what
 * may be *touched*, this one decides where the window may *go*.
 */
export class NavigationPolicy {
  constructor(
    private readonly config: NavigationPolicyConfig = WEB_ONLY_NAVIGATION,
  ) {}

  check(target: string): NavigationDecision {
    const url = parse(target);
    if (url === null) {
      return deny(
        "unparseable_url",
        `"${target}" is not a URL the agent can navigate to.`,
      );
    }
    if (!ALLOWED_SCHEMES.includes(url.protocol)) {
      return deny(
        "scheme_not_allowed",
        `"${url.protocol}" is a browser-internal or non-web scheme. The agent navigates to web pages only.`,
      );
    }
    return url.protocol === "file:" ? this.checkFile(url) : this.checkHost(url);
  }

  private checkFile(url: URL): NavigationDecision {
    const root = this.config.fileRoots.find((candidate) =>
      underRoot(url, candidate),
    );
    if (root === undefined) {
      return deny(
        "file_outside_roots",
        "That is a local file outside the directories this session is allowed to open. The agent does not browse the disk.",
      );
    }
    return { allowed: true };
  }

  private checkHost(url: URL): NavigationDecision {
    const host = url.hostname.toLowerCase();
    if (this.config.denyHosts.some((entry) => hostMatches(host, entry))) {
      return deny("host_denied", `${host} is on this session's denylist.`);
    }
    if (
      this.config.allowHosts.length > 0 &&
      !this.config.allowHosts.some((entry) => hostMatches(host, entry))
    ) {
      return deny(
        "host_not_allowed",
        `${host} is outside the domains this session was scoped to.`,
      );
    }
    return { allowed: true };
  }
}

/**
 * A root is checked in the filesystem semantics it is written in, because the
 * window is not always on this machine. A containerised session's fixture root
 * is a POSIX path that a Windows host cannot resolve at all — `fileURLToPath`
 * throws on it — so a posix-looking root is compared as posix text and a
 * host-looking one goes through the host's own resolver, as before.
 */
function underRoot(url: URL, root: string): boolean {
  if (root.startsWith("/")) {
    return isUnderPosix(decoded(url.pathname), root);
  }
  const path = toPath(url);
  return path !== null && isUnder(path, root);
}

function decoded(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * Resolved by folding segments rather than by `path.resolve`, which would
 * reinterpret a POSIX path against a Windows working directory. `..` is folded
 * first, so a traversal out of the root is a miss rather than a match.
 */
function isUnderPosix(path: string, root: string): boolean {
  const target = foldPosix(path);
  const base = foldPosix(root);
  return target === base || target.startsWith(`${base}/`);
}

function foldPosix(value: string): string {
  const parts: string[] = [];
  for (const segment of value.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

function hostMatches(host: string, entry: string): boolean {
  const pattern = entry.toLowerCase().replace(/^\*\./, "");
  return host === pattern || host.endsWith(`.${pattern}`);
}

function parse(target: string): URL | null {
  try {
    return new URL(target);
  } catch {
    return null;
  }
}

function toPath(url: URL): string | null {
  try {
    return fileURLToPath(url);
  } catch {
    return null;
  }
}

function deny(rule: string, human: string): NavigationDecision {
  return { allowed: false, rule, human };
}
