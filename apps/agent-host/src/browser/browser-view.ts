import type { BrowserSession, JournalEvent } from "@covenant/browser-drive";

import { askFor } from "./handoff-copy.js";

export interface BrowserActionView {
  readonly id: string;
  readonly label: string;
  readonly outcome: "ok" | "refused";
  /** Who caused it. The whole point of the split is that this is answerable. */
  readonly actor: "agent" | "user";
  readonly reason?: string;
}

export interface BrowserSandboxView {
  /** `container` means a Docker container; `native-window` means this machine. */
  readonly surface: "native-window" | "container";
  /** The container holding the window, or `in-process`. */
  readonly id: string;
}

export interface BrowserSessionView {
  /** The conversation whose run opened this window; a chat that did not
   *  claim it renders its restored record, never the live picture. */
  readonly conversation?: string | null;
  /** Which window this is. The Bench names it on every call that reaches it. */
  readonly id: string;
  readonly sandbox: BrowserSandboxView;
  readonly merchant: string;
  readonly url: string;
  readonly title: string;
  readonly state: "idle" | "agent-drive" | "user-drive" | "closed";
  readonly handoff: {
    readonly reason: string;
    readonly ask: string;
  } | null;
  readonly actions: readonly BrowserActionView[];
}

/** The tail only: the card shows recent work, the ledger keeps all of it. */
const KEEP = 12;

/** Scrolling and frame reads are noise in a summary of what was done. */
const HIDDEN = new Set(["page.scrolled", "readiness.polled", "page.read"]);

function text(detail: Readonly<Record<string, unknown>>, key: string): string {
  const value = detail[key];
  return typeof value === "string" ? value : "";
}

/** Long enough to name a page, short enough to read in a card. */
const MAX_LABEL = 64;

function clip(label: string): string {
  return label.length <= MAX_LABEL ? label : `${label.slice(0, MAX_LABEL)}…`;
}

/**
 * Host and path, never the query string. Taking the last path segment put a
 * Google redirect's whole tracking payload — `q=EhAqCbrBNsAbcAAA…` — into the
 * line that is supposed to tell a person what the agent did. The full URL is
 * in the journal, which is where precision belongs.
 */
export function pageName(url: string | null): string {
  if (url === null || url === "") return "the page";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return clip(parsed.pathname.split("/").pop() || url);
    }
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return clip(`${parsed.host.replace(/^www\./, "")}${path}`);
  } catch {
    return clip(url);
  }
}

function agentLabel(event: JournalEvent): string {
  const selector = text(event.detail, "selector");
  const map: Readonly<Record<string, string>> = {
    "session.launched": "Opened a disposable Chrome window",
    "session.closed": "Closed the window and deleted the profile",
    "page.navigated": `Opened ${pageName(event.url)}`,
    "page.clicked": `Clicked ${selector || "a control"}`,
    "page.typed": `Typed into ${selector || "a field"}`,
    "page.keyed": `Pressed ${text(event.detail, "key")}`,
    "handoff.raised": "Handed the wheel to you",
    "context.flagged": `Noted this is a ${text(event.detail, "reason")} page — readable, not touchable`,
    "handoff.resumed": "You handed the wheel back",
    "window.fronted": "Brought the Saathi window to the front",
    "handoff.pointed":
      "Handed you the page to open in your own browser — this one cannot do it",
    "action.blocked": `Refused to ${text(event.detail, "action")} ${selector || "there"}`,
  };
  return map[event.kind] ?? event.kind;
}

function userLabel(event: JournalEvent): string {
  const map: Readonly<Record<string, string>> = {
    "page.clicked": "You clicked in the window",
    "page.typed": "You typed in the window",
    "page.keyed": `You pressed ${text(event.detail, "key")}`,
    "window.fronted": "The Saathi window came to the front",
    "handoff.pointed": "This page is yours to open in your own browser",
    "action.blocked": "Refused to pass that through — it is a protected field",
  };
  return map[event.kind] ?? agentLabel(event);
}

function actionOf(event: JournalEvent): BrowserActionView {
  const refused = event.kind === "action.blocked";
  const human = text(event.detail, "human");
  return {
    id: `j${event.seq}`,
    label: event.actor === "user" ? userLabel(event) : agentLabel(event),
    outcome: refused ? "refused" : "ok",
    actor: event.actor,
    ...(refused && human !== "" ? { reason: human } : {}),
  };
}

export function actionsOf(
  events: readonly JournalEvent[],
): readonly BrowserActionView[] {
  return events
    .filter((event) => !HIDDEN.has(event.kind))
    .slice(-KEEP)
    .map(actionOf);
}

/**
 * Whose shop the window is standing in. Read off the live URL rather than
 * fixed at build time: the same card now shows a real merchant when the agent
 * goes looking on the open web, and a card that still said "local fixture"
 * there would be the one thing on screen that was lying.
 */
export function merchantOf(url: string): string {
  if (url.startsWith("file:")) return "local fixture shop";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "no page open";
  }
}

/** The card, assembled from the session itself. */
export function sessionView(
  session: BrowserSession,
  id: string,
): BrowserSessionView {
  const handoff = session.handoff().current();
  const url = session.url();
  return {
    id,
    sandbox: { surface: session.surface(), id: session.sandboxId() },
    merchant: merchantOf(url),
    url,
    title: pageName(url),
    state: session.currentState(),
    handoff:
      handoff === null
        ? null
        : { reason: handoff.reason, ask: askFor(handoff.reason) },
    actions: actionsOf(session.journalEntries()),
  };
}
