import type { Clock } from "@covenant/domain";

import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { AgentHostConfig } from "../config.js";
import type { ContextLog } from "../purchase/context-log.js";
import { openContextLog } from "../purchase/context-log.js";
import { ContextRecorder } from "../purchase/context-record.js";
import type { WebOffered } from "../purchase/web-offered.js";
import type { WebPickPark } from "../purchase/web-pick-park.js";
import type { ObsParts } from "./obs-wiring.js";

export interface ContextParts {
  readonly recorder: ContextRecorder;
  /** Closed at shutdown beside the beat log; both live in the same file. */
  readonly log: ContextLog;
}

/**
 * The working-context layer: the durable record behind the in-memory tables.
 * Wired over the same four collaborators the window layer builds — the card
 * table, the park, the progress, the findings — because the record is nothing
 * but the durable shadow of what those already hold.
 */
export function wireWorkingContext(
  deps: { config: AgentHostConfig; clock: Clock; obs: ObsParts },
  window: {
    readonly offered: WebOffered;
    readonly park: WebPickPark;
    readonly progress: WebProgress;
    readonly findings: WebFindings;
  },
): ContextParts {
  const log = openContextLog(deps.config.dbFile, deps.clock, deps.obs.logger);
  return {
    log,
    recorder: new ContextRecorder(log, window, deps.obs.logger),
  };
}
