// The sandbox key, and every fetch that has to carry it. Split out of
// liveBrowser.ts so the transport reads as the transport: what to poll and
// when, not how the host is persuaded to answer.
const KEY_HEADER = "X-Covenant-Browser-Key";
const SESSION_HEADER = "X-Covenant-Browser-Session";

/** Every header this page adds to a sandbox call. The host has to allow all of
 *  them through the preflight or the card cannot read the window at all. */
export const SANDBOX_HEADERS: readonly string[] = [KEY_HEADER, SESSION_HEADER];

/**
 * The session key, fetched once from the host that minted it. It is held in a
 * module variable rather than in storage: it belongs to one agent-host process,
 * and a key that outlived the tab it was handed to would be a key that outlived
 * the window it protects.
 */
let sessionKey: string | null = null;

/**
 * Which window this page believes it is driving. The key alone cannot say
 * that — it is minted once per agent-host boot and outlives any number of
 * sandbox sessions, so a tab left open across two errands would hold a valid
 * key for a container that no longer exists. Sending the id along is what
 * makes the host able to refuse rather than quietly re-aim the keystrokes at
 * whatever window happens to be open now.
 */
// Per conversation, not one module global: two lanes' wires overwrote each
// other's id, and every call from the other lane then carried the wrong
// window and was refused NOT_YOUR_WINDOW. The empty key holds the default
// (conversation-less) lane's window.
const openSessions = new Map<string, string>();

export function rememberSession(id: string, conversation: string | null = null): void {
  const key = conversation ?? "";
  if (id === "") openSessions.delete(key);
  else openSessions.set(key, id);
}

/** The host answered and said no. Distinct from "the host is not there". */
export class Refused extends Error {}

function keyed(
  extra: Record<string, string> = {},
  conversation: string | null = null,
): Record<string, string> {
  const headers = { ...extra };
  if (sessionKey !== null) headers[KEY_HEADER] = sessionKey;
  const open = openSessions.get(conversation ?? "");
  if (open !== undefined) headers[SESSION_HEADER] = open;
  return headers;
}

/**
 * Which lane's window a sandbox call means. The host serves one agent window
 * per conversation now, so an unscoped call from a lane chat would watch the
 * primary — someone else's errand — while its own window went unshown.
 */
export function scoped(path: string, conversation: string | null): string {
  if (conversation === null || conversation === "") return path;
  return `${path}?conversation=${encodeURIComponent(conversation)}`;
}

/** Appends the key where a header cannot go: `EventSource` sends none. */
export function streamUrl(base: string, conversation: string | null): string {
  const key = sessionKey ?? "";
  const lane =
    conversation === null || conversation === ""
      ? ""
      : `&conversation=${encodeURIComponent(conversation)}`;
  return `${base}/browser/frames?key=${encodeURIComponent(key)}${lane}`;
}

/**
 * Only 401 and 403 are the host saying no to this page. Everything else that
 * is not a key — a 503, a 404 from a host that is listening but has not wired
 * its routes yet — is the host not being there, and the two must not be
 * conflated: a refusal is terminal for the sandbox card and being mid-restart
 * is the case it is supposed to climb back out of. Answering a restart with
 * `Refused` is what stranded the card on "no session key" for the rest of the
 * session while agent-host was up and serving frames.
 */
export async function handshake(base: string): Promise<void> {
  const res = await fetch(`${base}/browser/handshake`);
  if (res.status === 401 || res.status === 403)
    throw new Refused(`handshake → ${res.status}`);
  if (!res.ok) throw new Error(`handshake → ${res.status}`);
  const body = (await res.json()) as { key?: unknown };
  sessionKey = typeof body.key === "string" ? body.key : null;
  if (sessionKey === null) throw new Error("handshake carried no key");
}

/**
 * A 401 usually means the key went stale, not that this page was never trusted:
 * the key is minted when agent-host boots, so every restart invalidates the one
 * an open tab is holding. Ask once for a new one before believing the refusal —
 * otherwise a routine restart leaves the sandbox card reading as locked out for
 * the rest of the session.
 */
async function withFreshKey(base: string, send: () => Promise<Response>) {
  const first = await send();
  if (first.status !== 401) return first;
  await handshake(base);
  return await send();
}

export async function get(
  base: string,
  path: string,
  conversation: string | null = null,
): Promise<Response> {
  const res = await withFreshKey(base, () =>
    fetch(`${base}${path}`, { headers: keyed({}, conversation) }),
  );
  if (res.status === 401) throw new Refused(path);
  return res;
}

export async function post(
  base: string,
  path: string,
  body?: unknown,
  conversation: string | null = null,
): Promise<unknown> {
  const res = await withFreshKey(base, () =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: keyed({ "content-type": "application/json" }, conversation),
      body: JSON.stringify(body ?? {}),
    }),
  );
  if (res.status === 401) throw new Refused(path);
  return (await res.json()) as unknown;
}
