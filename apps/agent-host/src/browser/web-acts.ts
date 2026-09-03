import type { BrowserSession, PageDom, Waiter } from "@covenant/browser-drive";

import { SETTLE_MS, settledRead } from "./settled-read.js";
import { observeWindow } from "./web-handover.js";
import type { WebProgress } from "./web-progress.js";
import type { WebPageView } from "./web-page-view.js";
import { WEB_PROVENANCE } from "./web-page-view.js";
import type { WebResult } from "./web-result.js";
import type { WebTrail } from "./web-trail.js";
import { webOk, webRefusal } from "./web-result.js";

/**
 * The acting verbs' shared shape, split from `WebShopper` so each file keeps
 * one idea: the shopper owns the session and the refs, this owns what an act
 * is. Every act ends the same way — the page settles, the trail records where
 * the window went, and the page it landed on is named for what it looks like,
 * so the model knows which step it is standing on before its next move.
 */
export interface ActDeps {
  readonly waiter: Waiter;
  readonly trail: WebTrail;
  readonly progress: WebProgress;
  readonly view: (dom: PageDom) => WebPageView;
}

export async function settleAfterAct(
  session: BrowserSession,
  deps: ActDeps,
  fact: Readonly<Record<string, unknown>>,
  carted = false,
): Promise<WebResult> {
  const dom = await settledRead(session, deps.waiter, SETTLE_MS);
  deps.trail.record(dom.url);
  // Act landed and the page settled: only now is it a fact.
  if (carted) deps.progress.recordCarted();
  return webOk({
    ...fact,
    page: deps.view(dom),
    ...observeWindow(dom),
    provenance: WEB_PROVENANCE,
  });
}

/** A click aimed at a point from the last read's own boxes. The judge is the
 *  hit-test plus the classifier — see `PointActions` in browser-drive. */
export async function pressAt(
  session: BrowserSession,
  deps: ActDeps,
  x: number,
  y: number,
): Promise<WebResult> {
  const clicked = await session.points().click(x, y);
  if (!clicked.ok) return webRefusal(clicked);
  return settleAfterAct(session, deps, { pressed: { x, y } });
}

/**
 * Looking further down the page the window is already on. Nothing is aimed at
 * and nothing is pressed; what moves is which pixels the coordinates name.
 *
 * It settles like every other act rather than returning the instant the
 * viewport jumps, because what is below the fold is usually what a shop has
 * not painted yet - the read that follows is the half of this move the model
 * can use.
 */
export async function scrollPage(
  session: BrowserSession,
  deps: ActDeps,
  dy: number,
): Promise<WebResult> {
  const scrolled = await session.points().scroll(dy);
  if (!scrolled.ok) return webRefusal(scrolled);
  return settleAfterAct(session, deps, { scrolled: dy });
}

/** Keystrokes into a text box at a point: a quantity, a pincode. Refused
 *  before the focusing click unless the box is an ordinary text entry. */
export async function writeAt(
  session: BrowserSession,
  deps: ActDeps,
  x: number,
  y: number,
  text: string,
): Promise<WebResult> {
  const typed = await session.points().type(x, y, text);
  if (!typed.ok) return webRefusal(typed);
  return settleAfterAct(session, deps, { wrote: { x, y, chars: text.length } });
}
