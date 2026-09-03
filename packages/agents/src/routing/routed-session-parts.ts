import type { DraftGroup } from "../providers/attempt-drafts.js";
import type { GuardedToolDispatcher } from "../providers/guarded-tool-dispatcher.js";
import type { ToolDeclaration } from "../providers/tool-declarations.js";
import { wireNameOf } from "../providers/tool-declarations.js";
import type { DraftScope, DraftSink } from "../providers/turn-stream.js";
import type {
  AgentSession,
  AgentTurn,
  AgentTurnInput,
} from "../shared/agent-session.js";
import type { CatalogModel } from "./model-catalog.js";
import type { RoutingRequest } from "./model-router.js";

export interface RoutedSessionBuild {
  readonly session: AgentSession;
  /** `null` only for a session a test builds without a guard. */
  readonly guard: GuardedToolDispatcher | null;
}

export interface RoutedSessionFactory {
  build(model: CatalogModel, drafts: DraftScope | null): RoutedSessionBuild;
}

export interface RoutedSessionConfig {
  readonly tools: readonly ToolDeclaration[];
  readonly requiresStructuredOutput: boolean;
  /**
   * This session answers by calling one of its tools; the prose beside it is
   * optional. Two scoring rules follow, and both were wrong without it. A turn
   * that called nothing has failed rather than abstained, so the cheapest rung
   * stops being accepted for having said nothing; and a turn that put all of
   * its words inside the tool arguments is not a refusal, so a correct choice
   * stops being pushed up a ladder it never needed to climb.
   */
  readonly decidesByToolCall?: boolean;
  /** Where a streamed answer goes while it is still being written. */
  readonly sink?: DraftSink | null;
}

export interface Run {
  readonly build: RoutedSessionBuild;
  readonly group: DraftGroup;
  readonly turn: AgentTurn;
}

/** The attempt the harness used keeps its drafts; every other says why it went. */
export function judge(
  groups: readonly DraftGroup[],
  kept: DraftGroup | undefined,
  reason: string,
): void {
  for (const group of groups) {
    if (group === kept) group.release();
    else group.withdrawAll(reason);
  }
}

/** A repeat sample must not overwrite the record of the first trial — and the
 *  session it ran on has nothing left to answer, so it is closed, not dropped. */
export async function record(
  runs: Map<string, Run>,
  key: string,
  run: Run,
): Promise<void> {
  if (runs.has(key)) {
    await run.build.session.close();
    return;
  }
  runs.set(key, run);
}

export function requestOf(
  input: AgentTurnInput,
  config: RoutedSessionConfig,
): RoutingRequest {
  return {
    // The shopper's sentence, never the instructions wrapped around it.
    prompt: input.subject ?? input.userMessage ?? "",
    availableTools: config.tools.map(wireNameOf),
    requiresStructuredOutput: config.requiresStructuredOutput,
  };
}
