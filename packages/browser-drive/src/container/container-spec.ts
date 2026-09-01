import { sessionPreferences } from "../chrome/profile-preferences.js";
import { CONTAINER_DOWNLOAD_DIR } from "./docker-args.js";
import type { ContainerSpec } from "./run-args.js";
import { labelledSession } from "./docker-cli.js";

export interface ContainerLauncherConfig {
  readonly image: string;
  /** Host path to the seccomp profile Chrome's own sandbox needs. */
  readonly seccompProfile: string;
  readonly memoryMb: number;
  /** The hard ceiling, enforced inside the container by `timeout`. */
  readonly ttlSeconds: number;
  readonly sessionId: string;
}

export class ContainerBindingError extends Error {
  constructor(
    readonly expected: string,
    readonly found: string | null,
  ) {
    super(
      `The container that started is labelled for session "${found ?? "nothing"}", not "${expected}". Refusing to attach: a session may only ever reach the container it opened.`,
    );
    this.name = "ContainerBindingError";
  }
}

/**
 * The container's name and network are derived from the session id and from
 * nothing else, so the mapping is one-to-one by construction rather than by
 * bookkeeping. The id is scrubbed for the same reason `TmpSandboxFactory`
 * scrubs it: a session id is a string from somewhere else.
 */
export function specOf(config: ContainerLauncherConfig): ContainerSpec {
  const scrubbed = config.sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  const id = scrubbed === "" ? "session" : scrubbed;
  return {
    sessionId: config.sessionId,
    image: config.image,
    containerName: `covenant-browse-${id}`,
    networkName: `covenant-browse-net-${id}`,
    seccompProfile: config.seccompProfile,
    memoryMb: config.memoryMb,
    ttlSeconds: config.ttlSeconds,
    prefsJson: JSON.stringify(sessionPreferences(CONTAINER_DOWNLOAD_DIR)),
  };
}

/**
 * Read back off the container that actually started, not assumed from the name
 * we asked for. A leftover container answering to the same name is the one way
 * an attach could land on somebody else's window, and this is where that stops.
 */
export async function assertBound(spec: ContainerSpec): Promise<void> {
  const found = await labelledSession(spec.containerName);
  if (found !== spec.sessionId) {
    throw new ContainerBindingError(spec.sessionId, found);
  }
}
