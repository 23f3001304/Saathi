import { IntentDrafter } from "@covenant/agents";

import { CartBuilder } from "../purchase/cart-builder.js";
import { CheckoutStep } from "../purchase/checkout-step.js";
import type { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { ConversationMemory } from "../purchase/conversation-memory.js";
import { IntentFlow } from "../purchase/intent-flow.js";
import { LastProposal } from "../purchase/last-proposal.js";
import type { PendingDraft } from "../purchase/pending-draft.js";
import { PurchaseRunner } from "../purchase/purchase-runner.js";
import { RunNarrator } from "../purchase/run-narrator.js";
import type { RunnerConfig, SandboxOwner } from "../purchase/runner-parts.js";
import type { AgentToolDispatcher } from "../purchase/tool-dispatcher.js";
import { MerchantToolFallback } from "../purchase/tool-fallback.js";
import type { ToolLog } from "../purchase/tool-log.js";
import { checkoutOf, loopParts } from "./agent-loop.js";
import type { BuyerDeps } from "./buyer-parts.js";
import { draftDefaults, wireJudge } from "./judge-wiring.js";
import type { MemoryDeps } from "./memory-wiring.js";
import type { WebPickResume } from "../purchase/turn-step.js";
import { webLookOf } from "./web-wiring.js";

/** Entries the `cart-construction` retrieval may bind; the cart signs ≤64. */
const RETRIEVE_LIMIT = 32;

export function memoryDepsOf(deps: BuyerDeps): MemoryDeps {
  return {
    gateway: deps.gateway.client,
    clock: deps.clock,
    logger: deps.obs.logger,
    userId: deps.keys.userIss,
  };
}

/**
 * A disposable profile that outlives its purpose is a window nobody is
 * watching. A new question closes the last one — unless the shopper has the
 * wheel, in which case it is theirs and stays. The cost is that a basket built
 * on the open web does not survive the next question; that basket was never
 * ours to settle anyway, so it is the cheaper half of the trade.
 */
function sandboxOf(deps: BuyerDeps): SandboxOwner {
  return {
    async retire() {
      if (deps.browser.current()?.currentState() === "user-drive") {
        return false;
      }
      // A checkout parked on a question this host asked is not a stale window:
      // it is the shopper's own answer that is outstanding, and closing it
      // would throw away the basket and the filled address together.
      if (deps.park.parked) {
        return false;
      }
      await deps.browser.close();
      return true;
    },
  };
}

export function intentFlowOf(
  deps: BuyerDeps,
  gate: ConfirmationGate,
  pending: PendingDraft,
): IntentFlow {
  return new IntentFlow(
    new IntentDrafter(
      wireJudge({
        config: deps.config,
        shelf: deps.merchant.shelf,
        merchantIss: deps.keys.merchantIss,
        pending,
      }),
      deps.keys.intents,
      deps.clock,
      draftDefaults(deps.config),
    ),
    deps.gateway.client,
    deps.hub,
    gate,
    deps.browser,
    deps.obs.logger,
    {
      userIss: deps.keys.userIss,
      tenantId: deps.config.tenantId,
      agentInstanceId: deps.identity.instance.instanceId,
    },
  );
}

function runnerConfigOf(deps: BuyerDeps): RunnerConfig {
  return {
    userId: deps.keys.userIss,
    tenantId: deps.config.tenantId,
    merchantIss: deps.keys.merchantIss,
    agentInstanceId: deps.identity.instance.instanceId,
    retrieveLimit: RETRIEVE_LIMIT,
  };
}

export interface RunnerShared {
  readonly webPick: WebPickResume;
  readonly intentGate: ConfirmationGate;
  /** One intent flow for the lane: the runner's buys and the web pick's
   *  sign-before-drive both wait on this same gate and ceiling. */
  readonly intents: IntentFlow;
  /** The planner's proposal, read by the live judge when the sheet is drafted. */
  readonly pending: PendingDraft;
  readonly cartGate: ConfirmationGate;
  /** Built once above and handed in, because the read route behind
   *  `GET /chat/history` answers from this same instance. */
  readonly conversation: ConversationMemory;
}

/** Everything the turn fork reads about the open web: the look, the pick, the
 *  cards already on the table, and where a streamed answer went. */
function webParts(
  deps: BuyerDeps,
  dispatcher: AgentToolDispatcher,
  shared: RunnerShared,
) {
  return {
    webLook: webLookOf(deps, dispatcher),
    webPick: shared.webPick,
    offered: deps.offered,
    drafts: deps.drafts ?? null,
  };
}

/** The shopper's side of the turn: the conversation's working record, what is
 *  durably known about them, and the language the answer is owed in. */
function shopperParts(deps: BuyerDeps) {
  return {
    context: deps.context,
    traits: deps.traits,
    language: deps.language,
  };
}

function narratorOf(deps: BuyerDeps, log: ToolLog): RunNarrator {
  return new RunNarrator(deps.hub, log, deps.obs.journal);
}

/** The three things one run reads off the merchant, kept together so the
 *  shelf, the quota and the id are opened and named in one place. */
function merchantParts(deps: BuyerDeps) {
  return {
    hub: deps.hub,
    shelf: deps.merchant.shelf,
    quotes: deps.merchant.agent,
    merchantId: deps.merchant.merchantId,
  };
}

export function wireRunner(
  deps: BuyerDeps,
  log: ToolLog,
  dispatcher: AgentToolDispatcher,
  shared: RunnerShared,
): PurchaseRunner {
  return new PurchaseRunner(
    {
      log,
      lastProposal: new LastProposal(),
      pending: shared.pending,
      cartGate: shared.cartGate,
      ...loopParts(deps, dispatcher),
      intents: shared.intents,
      fallback: new MerchantToolFallback(
        deps.gateway.hook,
        dispatcher,
        log,
        deps.obs.logger,
      ),
      gateway: deps.gateway.client,
      carts: new CartBuilder(deps.keys.carts, deps.clock, deps.ids),
      settlement: new CheckoutStep(
        checkoutOf(deps),
        deps.gateway.reader,
        deps.hub,
      ),
      ...merchantParts(deps),
      narrator: narratorOf(deps, log),
      planner: deps.planner,
      conversation: shared.conversation,
      ...shopperParts(deps),
      ...webParts(deps, dispatcher, shared),
      sandbox: sandboxOf(deps),
      logger: deps.obs.logger,
      ids: deps.ids,
    },
    runnerConfigOf(deps),
  );
}
