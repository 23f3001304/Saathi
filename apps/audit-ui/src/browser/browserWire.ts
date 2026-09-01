// Parsing agent-host's sandbox routes. Everything that crosses the wire is
// narrowed here, so the card never renders a shape it only hoped for.
import type {
  BrowserBlackout,
  BrowserSandbox,
  BrowserSessionView,
} from "./browserSession.ts";
import type { BrowserFrame, RelayOutcome } from "./browserTransport.ts";

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag | null {
  return typeof value === "object" && value !== null ? (value as Bag) : null;
}

function str(source: Bag, key: string, fallback = ""): string {
  const value = source[key];
  return typeof value === "string" ? value : fallback;
}

function num(source: Bag, key: string): number {
  const value = source[key];
  return typeof value === "number" ? value : 0;
}

const STATES = ["idle", "agent-drive", "user-drive", "closed"];

function actionsOf(value: unknown): BrowserSessionView["actions"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = bag(entry);
    if (row === null) return [];
    const reason = str(row, "reason");
    return [
      {
        id: str(row, "id", `a${index}`),
        label: str(row, "label"),
        outcome: str(row, "outcome") === "refused" ? "refused" : "ok",
        actor: str(row, "actor") === "user" ? "user" : "agent",
        ...(reason === "" ? {} : { reason }),
      } as const,
    ];
  });
}

function handoffOf(value: unknown): BrowserSessionView["handoff"] {
  const row = bag(value);
  if (row === null) return undefined;
  return { reason: str(row, "reason"), ask: str(row, "ask") };
}

function sandboxOf(value: unknown): BrowserSandbox | undefined {
  const row = bag(value);
  if (row === null) return undefined;
  const surface = str(row, "surface");
  return {
    surface: surface === "container" ? "container" : "native-window",
    id: str(row, "id"),
  };
}

/** `null` is a real answer here: the host is up and no window is open. */
export function parseSession(value: unknown): BrowserSessionView | null {
  const body = bag(value);
  const session = body === null ? null : bag(body["session"]);
  if (session === null) return null;
  const state = str(session, "state");
  const handoff = handoffOf(session["handoff"]);
  const sandbox = sandboxOf(session["sandbox"]);
  return {
    id: str(session, "id"),
    ...(sandbox === undefined ? {} : { sandbox }),
    merchant: str(session, "merchant"),
    url: str(session, "url"),
    title: str(session, "title"),
    state: STATES.includes(state)
      ? (state as BrowserSessionView["state"])
      : "closed",
    ...(handoff === undefined ? {} : { handoff }),
    actions: actionsOf(session["actions"]),
    conversation:
      typeof session["conversation"] === "string"
        ? session["conversation"]
        : null,
  };
}

export type ParsedCapture =
  | { readonly kind: "frame"; readonly frame: BrowserFrame }
  | { readonly kind: "blackout"; readonly blackout: BrowserBlackout };

/**
 * A tick carries either a picture or the news that none was taken. The second
 * is not an error and must not be parsed as one: a dropped frame leaves the
 * last picture on screen, which is the right answer for a missed tick and the
 * wrong one here, where the point is that the host stopped looking.
 */
export function parseFrame(value: unknown): ParsedCapture | null {
  const body = bag(value);
  const frame = body === null ? null : (bag(body["frame"]) ?? body);
  if (frame === null) return null;
  const blackout = bag(frame["blackout"]);
  if (blackout !== null) {
    return {
      kind: "blackout",
      blackout: {
        category: str(blackout, "category"),
        human: str(blackout, "human"),
      },
    };
  }
  const image = str(frame, "image");
  // An allow-list of two, checked here rather than trusted: the `src` of an
  // <img> is the one place a hostile string from the wire could become a
  // navigation, and `javascript:` is a URL too.
  if (
    !image.startsWith("data:image/png;base64,") &&
    !image.startsWith("data:image/jpeg;base64,")
  ) {
    return null;
  }
  return {
    kind: "frame",
    frame: {
      image,
      width: num(frame, "width"),
      height: num(frame, "height"),
      redacted: num(frame, "redacted"),
      passthrough: frame["passthrough"] === true,
    },
  };
}

export function parseRelay(value: unknown): RelayOutcome {
  const body = bag(value);
  if (body === null) {
    return {
      ok: false,
      human:
        "The host gave an answer this page could not read, so treat the action as not taken.",
      handOffNatively: false,
      nativeEntry: null,
      fronted: false,
      surface: null,
      openUrl: null,
    };
  }
  if (body["ok"] === true) return { ok: true };
  return {
    ok: false,
    human: str(body, "human", str(body, "reason_code", "Refused.")),
    handOffNatively: body["hand_off_natively"] === true,
    nativeEntry:
      typeof body["native_entry"] === "string" ? body["native_entry"] : null,
    fronted: body["fronted"] === true,
    surface: body["surface"] === "container" ? "container" : null,
    openUrl: typeof body["open_url"] === "string" ? body["open_url"] : null,
  };
}
