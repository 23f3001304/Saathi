import { DraftGroup, ESCALATED_AWAY } from "../providers/attempt-drafts.js";
import { DRAFT_CALL_FAILED } from "../providers/provider-turn-loop.js";
import type {
  AgentSession,
  AgentTurn,
  AgentTurnInput,
} from "../shared/agent-session.js";
import { signalsOf } from "./confidence-signals.js";
import type { CatalogModel } from "./model-catalog.js";
import { modelKeyOf } from "./model-catalog.js";
import type { AttemptRunner, ModelRouter } from "./model-router.js";
import { schemaOutcomeOf, toolArgsOutcomeOf } from "./output-checks.js";
import type {
  RoutedSessionBuild,
  RoutedSessionConfig,
  RoutedSessionFactory,
  Run,
} from "./routed-session-parts.js";
import { judge, record, requestOf } from "./routed-session-parts.js";

export type {
  RoutedSessionBuild,
  RoutedSessionConfig,
  RoutedSessionFactory,
} from "./routed-session-parts.js";

/**
 * An `AgentSession` that picks its own model. Callers see the ordinary port,
 * and no operator is ever asked which model to use.
 *
 * DECISION: routing happens on the opening turn and the winner is **pinned**
 * for the rest of the run. Escalation re-runs the same turn on the next rung,
 * which is only sound while the conversation is one message long: every
 * provider adapter keeps its history inside its own exchange, so moving a
 * half-finished negotiation elsewhere would either lose it or cost a full
 * replay. `close()` clears the pin, so the next run routes again with
 * whatever the statistics have learned since.
 *
 * DECISION: the factory hands back the `GuardedToolDispatcher` alongside the
 * session. Not so the router can influence it — so the router can *read* it,
 * for the tool-argument signal, and so every rung runs behind one.
 *
 * DECISION: each attempt streams into drafts of its own, and only the attempt
 * whose text the router returned keeps them. Confidence still scores the
 * finished `turn.text`: streaming moved when the shopper sees prose and
 * nothing else, which is what lets a discarded answer leave the screen.
 */
export class RoutedAgentSession implements AgentSession {
  private pinned: Run | null = null;

  constructor(
    private readonly router: ModelRouter,
    private readonly factory: RoutedSessionFactory,
    private readonly config: RoutedSessionConfig,
  ) {}

  async turn(input: AgentTurnInput): Promise<AgentTurn> {
    const pinned = this.pinned;
    if (pinned !== null) {
      return this.runPinned(pinned, input);
    }
    return this.routeAndRun(input);
  }

  async close(): Promise<void> {
    const pinned = this.pinned;
    this.pinned = null;
    await pinned?.build.session.close();
  }

  /** A pinned session has no rung above it: its drafts stand as settled. */
  private async runPinned(run: Run, input: AgentTurnInput): Promise<AgentTurn> {
    try {
      const turn = await run.build.session.turn(input);
      run.group.release();
      return turn;
    } catch (cause) {
      run.group.withdrawAll(DRAFT_CALL_FAILED);
      throw cause;
    }
  }

  private async routeAndRun(input: AgentTurnInput): Promise<AgentTurn> {
    const runs = new Map<string, Run>();
    const groups: DraftGroup[] = [];
    try {
      const result = await this.router.route(
        requestOf(input, this.config),
        this.runnerOf(input, runs, groups),
      );
      // The router returns a model's *first* trial, so those are the drafts.
      judge(groups, runs.get(result.decision.chosen)?.group, ESCALATED_AWAY);
      return this.pin(result.decision.chosen, runs);
    } catch (cause) {
      judge(groups, undefined, DRAFT_CALL_FAILED);
      throw cause;
    }
  }

  private runnerOf(
    input: AgentTurnInput,
    runs: Map<string, Run>,
    groups: DraftGroup[],
  ): AttemptRunner {
    return {
      run: async (model: CatalogModel, _request, taskClass) => {
        const key = modelKeyOf(model);
        // A repeat of a model already tried is the self-consistency probe, not
        // a second answer. It is scored and thrown away, so streaming it would
        // write the same turn onto the screen twice and then take one back.
        const sink = this.config.sink ?? null;
        const group = new DraftGroup(runs.has(key) ? null : sink);
        groups.push(group);
        const build = this.factory.build(model, group, taskClass);
        const turn = await build.session.turn(input);
        await record(runs, key, { build, group, turn });
        return { text: turn.text, signals: this.signalsOf(turn, build) };
      },
    };
  }

  private signalsOf(turn: AgentTurn, build: RoutedSessionBuild) {
    const decidesByTool = this.config.decidesByToolCall === true;
    return signalsOf({
      text: turn.text,
      schema: schemaOutcomeOf(turn.text, this.config.requiresStructuredOutput),
      toolArgs: toolArgsOutcomeOf(
        build.guard?.seen ?? [],
        this.config.tools,
        decidesByTool,
      ),
      agreement: null,
      decidesByTool,
    });
  }

  private async pin(
    chosen: string,
    runs: Map<string, Run>,
  ): Promise<AgentTurn> {
    const winner = runs.get(chosen);
    if (winner === undefined) {
      throw new Error(`router chose ${chosen}, which never ran`);
    }
    const losers = [...runs.entries()].filter(([key]) => key !== chosen);
    await Promise.all(losers.map(([, run]) => run.build.session.close()));
    this.pinned = winner;
    return winner.turn;
  }
}
