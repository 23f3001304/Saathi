import type { AgentSession } from "@covenant/agents";

import type { BrowserRegistry } from "../browser/browser-registry.js";
import type { BrowserService } from "../browser/browser-service.js";
import { windowIdFor } from "../browser/sandbox-factory.js";
import { WebFindings } from "../browser/web-listing.js";
import { WebProgress } from "../browser/web-progress.js";
import { WebTrail } from "../browser/web-trail.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { TraitMemory } from "../purchase/trait-memory.js";
import { WebOffered } from "../purchase/web-offered.js";
import { WebPickPark } from "../purchase/web-pick-park.js";
import { WebPin } from "../purchase/web-pin.js";

export interface LaneWindowParts {
  readonly trail: WebTrail;
  readonly findings: WebFindings;
  readonly progress: WebProgress;
  readonly park: WebPickPark;
  readonly offered: WebOffered;
  readonly pin: WebPin;
  readonly traits: TraitMemory;
}

/**
 * The per-lane clones of the window tables `windowParts` used to build once.
 * Same shapes, same sharing *within* the lane, one trail so the report is of
 * the act, one set of findings so a card cannot carry a price off a page this
 * lane never opened, but nothing here is reachable from another lane.
 */
export function laneWindowParts(traits: TraitMemory): LaneWindowParts {
  return {
    trail: new WebTrail(),
    findings: new WebFindings(),
    progress: new WebProgress(),
    park: new WebPickPark(),
    offered: new WebOffered(),
    pin: new WebPin(),
    traits,
  };
}

/**
 * DECISION: the default lane (`null`) keeps the registry's primary window and
 * a named conversation gets an agent window of its own. Why: the CLI and the
 * e2e drive the primary by long-standing contract, and a conversation that
 * shared it would hand its page trail to whichever lane ran next, the
 * inherited-window bug, third time around. The id is DERIVED so the same
 * chat reopens the same profile across restarts, but through a hash: the
 * conversation string is client-chosen and reaches container names, and a
 * client must not get to pick those characters.
 */
export function laneBrowser(
  registry: BrowserRegistry,
  conversation: string | null,
): BrowserService {
  return conversation === null
    ? registry.primary()
    : registry.agentWindow(windowIdFor(conversation));
}

/** Everything a retired lane holds a resource through, released quietly. */
export async function closeLane(
  hub: BeatHub,
  browser: BrowserService,
  session: AgentSession,
): Promise<void> {
  hub.closeAll();
  await browser.close().catch(() => undefined);
  await session.close().catch(() => undefined);
}
