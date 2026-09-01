// Which lane the wire is asking for. A chat with an id asks its own lane's
// stream and state, so another conversation's beats cannot even be delivered
// to it; a chat with no id (fixture mode, the CLI's host) keeps the unscoped
// wire and the ownership dance that guards it.
import type { StreamSession } from "./beatSession.ts";

function lane(session: StreamSession, joiner: "?" | "&"): string {
  if (session.chat === null || session.chat === "") return "";
  return `${joiner}conversation=${encodeURIComponent(session.chat)}`;
}

export function stateUrl(session: StreamSession): string {
  return `${session.base}/chat/state${lane(session, "?")}`;
}

export function sseUrl(session: StreamSession): string {
  const cursor = `after=${session.seen}&epoch=${session.epoch}`;
  return `${session.base}/chat/stream?${cursor}${lane(session, "&")}`;
}
