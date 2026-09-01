import type {
  AgentSession,
  AgentToolRequest,
  AgentTurn,
  AgentTurnInput,
  ShelfView,
} from "@covenant/agents";
import type { IdGenerator } from "@covenant/domain";

import type {
  ScriptConfig,
  ScriptedToolRequest,
  ScriptedTurn,
} from "./script.js";
import { scriptFor } from "./script.js";

const EXHAUSTED: AgentTurn = { text: "", toolRequests: [], done: true };

/**
 * The zero-credential path. It is a real `AgentSession`, not a mock: it is
 * driven by `BuyerAgent`'s own loop, every tool it asks for passes through the
 * same `PreToolUseHook` the live SDK adapter installs, and every refusal comes
 * back to it as an ordinary tool error. What it does not do is choose — which
 * is why the demo it produces is reproducible and why the properties the tests
 * assert are properties of the harness rather than of a sampled model.
 */
export class ScriptedSession implements AgentSession {
  private turns: readonly ScriptedTurn[] = [];
  private cursor = 0;

  constructor(
    private readonly shelf: ShelfView,
    private readonly ids: IdGenerator,
    private readonly config: ScriptConfig,
  ) {}

  turn(input: AgentTurnInput): Promise<AgentTurn> {
    if (input.userMessage !== null) {
      this.turns = scriptFor(
        input.userMessage,
        this.shelf.current(),
        this.config,
      );
      this.cursor = 0;
    }
    const next = this.turns[this.cursor];
    if (next === undefined) {
      return Promise.resolve(EXHAUSTED);
    }
    this.cursor += 1;
    return Promise.resolve({
      text: next.text,
      toolRequests: next.toolRequests.map((request) => this.requestOf(request)),
      done: next.done,
    });
  }

  close(): Promise<void> {
    this.turns = [];
    this.cursor = 0;
    return Promise.resolve();
  }

  private requestOf(request: ScriptedToolRequest): AgentToolRequest {
    return {
      toolUseId: `toolu_${this.ids.uuid()}`,
      tool: request.tool,
      server: request.server,
      args: request.args,
    };
  }
}
