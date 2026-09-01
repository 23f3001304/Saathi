import { useMemo } from "react";
import { agentBaseUrl } from "../api/liveMode.ts";
import { ASSISTANT_SCRIPT } from "./assistantScript.ts";
import type { AssistantTransport } from "./assistantTransport.ts";
import { liveTransport } from "./liveTransport.ts";
import { resilientTransport } from "./resilientTransport.ts";
import { scriptTransport } from "./scriptTransport.ts";

/** Which side of the seam this page is on — decided once, at session start. */
export function createAssistantTransport(
  conversationId: string | null,
): AssistantTransport {
  const base = agentBaseUrl();
  if (base === null) return scriptTransport(ASSISTANT_SCRIPT);
  return resilientTransport(liveTransport(base, conversationId), () =>
    scriptTransport(ASSISTANT_SCRIPT),
  );
}

/**
 * One transport per chat session, for the session's lifetime. Re-deciding on
 * every render would restart the run; re-deciding on a URL change would strand
 * a half-finished purchase, so the choice is deliberately frozen at mount.
 *
 * The conversation id is the chat's, not this hook's: it arrives from the
 * shelf, is stable for as long as the chat exists, and so freezes with it.
 */
export function useAssistantTransport(
  conversationId: string | null,
): AssistantTransport {
  return useMemo(
    () => createAssistantTransport(conversationId),
    [conversationId],
  );
}
