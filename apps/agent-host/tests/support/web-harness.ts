import type {
  AgentToolResult,
  ToolArgs,
  ToolCall,
  ToolDispatcher,
  ToolOutcome,
} from "@covenant/agents";
import {
  GuardedToolDispatcher,
  MoneyToolRegistry,
  PreToolUseHook,
  WEB_TOOL_SERVER,
} from "@covenant/agents";
import { TimerWaiter } from "@covenant/browser-drive";
import type { Clock } from "@covenant/domain";

import { BrowserService } from "../../src/browser/browser-service.js";
import { GlanceVerbs } from "../../src/browser/web-glance.js";
import { HandoverMove } from "../../src/browser/web-handover-move.js";
import type { AddressFact } from "../../src/browser/web-address-fill.js";
import { WebFindings } from "../../src/browser/web-listing.js";
import { WebProgress } from "../../src/browser/web-progress.js";
import { WebShopper } from "../../src/browser/web-shopper.js";
import { WebTrail } from "../../src/browser/web-trail.js";
import { WebToolRunner } from "../../src/purchase/web-tool-runner.js";
/** Tests do not wait for a navigation that a fake page never starts. */
const NO_WAIT = { sleep: () => Promise.resolve() };

import { FakeShopPage } from "./fake-shop.js";
import { SilentLogger, StepClock } from "./fakes.js";
import {
  CollectingSink,
  CountingSink,
  SilentTracer,
  webSessionOf,
} from "./web-doubles.js";

/** Delegates to the web runner alone: the merchant and gateway halves of
 *  `AgentToolDispatcher` are not what these tests are about. */
export class WebOnlyDispatcher implements ToolDispatcher {
  constructor(private readonly runner: WebToolRunner) {}
  dispatch(call: ToolCall): Promise<ToolOutcome> {
    return this.runner.run(call);
  }
}

export interface WebHarness {
  readonly page: FakeShopPage;
  readonly service: BrowserService;
  readonly trail: WebTrail;
  readonly findings: WebFindings;
  readonly shopper: WebShopper;
  readonly progress: WebProgress;
  readonly journal: CollectingSink;
  readonly ledger: CountingSink;
  readonly guard: GuardedToolDispatcher;
  call(tool: string, args?: ToolArgs): Promise<AgentToolResult>;
  body(tool: string, args?: ToolArgs): Promise<Record<string, unknown>>;
}

/**
 * The real path, minus the browser: `PreToolUseHook` → `GuardedToolDispatcher`
 * → the web runner → `GuardedPage` → the real `FieldClassifier`. Only Chrome
 * and the sibling merchant tools are stood in for, so every refusal these tests
 * assert is a refusal the shipped guards produced.
 *
 * No vault and no research lane: those have suites of their own. The eyes are
 * wired, because every window move now comes back with a picture.
 */
function guardOf(
  service: BrowserService,
  shopper: WebShopper,
  progress: WebProgress,
  ledger: CountingSink,
): GuardedToolDispatcher {
  const runner = new WebToolRunner(
    shopper,
    new HandoverMove(() => service.current(), progress),
    null,
    undefined,
    null,
    null,
    null,
    { glance: new GlanceVerbs(service, NO_WAIT) },
  );
  return new GuardedToolDispatcher(
    new PreToolUseHook(
      new MoneyToolRegistry(),
      ledger,
      new SilentLogger(),
      new SilentTracer(),
      { tenantId: "tnt_demo", attackId: null },
    ),
    new WebOnlyDispatcher(runner),
    null,
  );
}

function serviceOf(page: FakeShopPage, clock: Clock, journal: CollectingSink) {
  return new BrowserService({
    build: (sessionId) => webSessionOf(page, clock, journal, sessionId),
    ids: { uuid: () => "web" },
    logger: new SilentLogger(),
  });
}

/** One dispatcher, one running tool-use id: the ref table a read fills is
 *  what the next click resolves against. */
function callerOn(guard: GuardedToolDispatcher) {
  let seq = 0;
  return (tool: string, args: ToolArgs = {}): Promise<AgentToolResult> => {
    seq += 1;
    return guard.dispatch({
      toolUseId: `t${seq}`,
      tool,
      server: WEB_TOOL_SERVER,
      args,
    });
  };
}

/** A shopper on a real `BrowserService`, for the real-Chrome suite: one ref
 *  table for the whole run, and no traits — the fill path has its own suite. */
export function webShopperOn(service: BrowserService): WebShopper {
  return new WebShopper(
    service,
    new WebTrail(),
    new TimerWaiter(),
    new WebFindings(),
    { lookup: () => Promise.resolve([]) },
    new WebProgress(),
  );
}

export function webHarness(traits: readonly AddressFact[] = []): WebHarness {
  const page = new FakeShopPage();
  const clock: Clock = new StepClock();
  const journal = new CollectingSink();
  const ledger = new CountingSink();
  const service = serviceOf(page, clock, journal);
  const trail = new WebTrail();
  const findings = new WebFindings();
  const progress = new WebProgress();
  const shopper = new WebShopper(
    service,
    trail,
    NO_WAIT,
    findings,
    { lookup: () => Promise.resolve(traits) },
    progress,
  );
  const guard = guardOf(service, shopper, progress, ledger);
  const call = callerOn(guard);
  return {
    page,
    service,
    trail,
    findings,
    shopper,
    progress,
    journal,
    ledger,
    guard,
    call,
    async body(tool, args) {
      const result = await call(tool, args);
      return JSON.parse(result.content) as Record<string, unknown>;
    },
  };
}
