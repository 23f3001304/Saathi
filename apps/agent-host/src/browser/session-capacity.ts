import { CONTAINER_MEMORY_MB } from "./sandbox-plan.js";

/** What one sandbox container is allowed to take, from `containerRunArgs`. */
export const CONTAINER_CPUS = 2;

/**
 * Left to the Docker VM itself: its own daemon, the overlay filesystem cache,
 * and the headroom a container needs while it is starting before its limit
 * is enforced. Not a guess about agent-host, which runs outside the VM.
 */
export const DOCKER_RESERVE_MB = 4096;

/**
 * Queue depth as a multiple of the cap. The repo's convention is 1.5–2x; this
 * sits in the middle. A queue much deeper than the cap is a queue nobody ever
 * reaches the front of, which is a worse answer than being turned away.
 */
export const QUEUE_FACTOR = 1.75;

/** A ceiling no measurement can argue past, for a machine being demoed on. */
export const MAX_SESSIONS = 12;

export interface HostResources {
  /** The Docker VM's memory, not the host's — containers draw from the VM. */
  readonly dockerMemMb: number;
  readonly cpus: number;
}

/**
 * How many sandboxes this machine can actually hold, derived rather than
 * picked.
 *
 * DECISION: the memory term uses the container's *declared limit*, not the
 * ~500-600 MiB a session was measured using. An average is the wrong number
 * to divide by: every container is entitled to its full 1024 MiB, and a cap
 * sized on typical usage is a cap that holds right up until several sessions
 * are busy at once, which is exactly when it matters.
 *
 * The CPU term is the one that actually binds on the machine this was written
 * on — 24 cores against `--cpus 2` gives 12, where memory would have allowed
 * 27. Both are computed anyway, because a memory-poor VM is the more common
 * shape and the smaller answer should win without anyone editing this.
 */
export function capFor(host: HostResources): number {
  const byMemory = Math.floor(
    Math.max(host.dockerMemMb - DOCKER_RESERVE_MB, 0) / CONTAINER_MEMORY_MB,
  );
  const byCpu = Math.floor(host.cpus / CONTAINER_CPUS);
  return Math.max(1, Math.min(byMemory, byCpu, MAX_SESSIONS));
}

/**
 * An operator's own number, when they have one.
 *
 * DECISION: an override rather than a smarter formula. `capFor` divides cores
 * by `CONTAINER_CPUS`, and on a four-core box - an Oracle Ampere A1, the free
 * tier this is hosted on - that gives two, before anything is kept warm. The
 * `--cpus 2` a container is given is a ceiling, not a reservation, so three
 * mostly-idle windows on four cores is a real arrangement the formula cannot
 * see. Somebody who knows their machine may say so; the derived number stays
 * the default, and the ceiling still applies, so this widens nothing that
 * `MAX_SESSIONS` did not already allow.
 */
export function capFrom(env: NodeJS.ProcessEnv, derived: number): number {
  const asked = Number(env["COVENANT_SANDBOX_CAP"] ?? "");
  if (!Number.isInteger(asked) || asked < 1) return derived;
  return Math.min(asked, MAX_SESSIONS);
}

export function queueLimitFor(cap: number): number {
  return Math.ceil(cap * QUEUE_FACTOR);
}

/** Conversation lanes never take more than this many runs at once. */
export const MAX_LANES = 3;

/**
 * How many conversations may *run* at once, derived from the sandbox cap
 * rather than picked: each running lane is entitled to a window of its own,
 * plus the shopper-requested sessions the registry already serves, so a lane
 * cap that ate the whole sandbox budget would starve the queue this machine
 * already promised to honour. Half the cap, floored, never zero, never past
 * three — three concurrent errands is already more model traffic than a
 * demo machine holds comfortably.
 *
 * DECISION (was a quarter): a lane drives at most one window at a time, so
 * a quarter left a 4-sandbox machine — the demo machine — with one lane and
 * no concurrency at all, which is the feature the lanes exist for. Half
 * gives that machine two lanes and still leaves two sandbox slots of
 * headroom for handovers and requested sessions.
 */
export function laneCapFor(sandboxCap: number): number {
  return Math.max(1, Math.min(MAX_LANES, Math.floor(sandboxCap / 2)));
}

/** What a message is told when every lane is mid-run. Honest, not a failure. */
export function laneWaitingSentence(position: number, cap: number): string {
  return (
    `All ${cap} conversation ${cap === 1 ? "lane is" : "lanes are"} mid-run, so this one is waiting rather than failing. ` +
    `It is number ${position} in line and starts the moment a run finishes. Nothing has been lost and nothing needs retrying.`
  );
}

/** The sentence the cap says when it is reached. It never claims a failure. */
export function waitingSentence(position: number, cap: number): string {
  return (
    `This machine holds ${cap} sandbox ${cap === 1 ? "window" : "windows"} at once and all of them are open, so this one is waiting rather than failing. ` +
    `You are number ${position} in the queue; the next window that closes is yours. Nothing has been lost and nothing needs retrying.`
  );
}

export const QUEUE_FULL_SENTENCE =
  "This machine is at its sandbox limit and the queue behind it is full too, so there is nowhere to put this request. Nothing was opened. Close a window that is finished with, or try again in a minute.";
