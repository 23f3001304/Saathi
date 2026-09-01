// The sandbox card, alone. The live feed pushes state up to thirty times a
// second; holding that state here means a frame repaints one card, not the
// whole transcript above it — which is exactly what made typing feel laggy.
import type { JSX } from "react";
import { BrowserSessionCard } from "../browser/BrowserSessionCard.tsx";
import { restoredCard } from "../browser/restoredCard.ts";
import { useBrowserSession } from "../browser/useBrowserSession.ts";
import type { SandboxSession } from "../api/agentBeat.ts";
import styles from "./Chat.module.css";

export type SandboxPaneProps = {
  active: boolean;
  conversationId: string | null;
  record: SandboxSession | null;
  /** Whether a run is in flight. A window left in `agent-drive` by a finished
   *  errand has no driver, and a card that says one is there reads as a hang. */
  busy: boolean;
};

export function SandboxPane({
  active,
  conversationId,
  record,
  busy,
}: SandboxPaneProps): JSX.Element | null {
  const browser = useBrowserSession(active);
  // The live window belongs to the conversation whose run claimed it; any
  // other chat renders its own restored record instead.
  const owns =
    browser.view?.conversation == null ||
    browser.view.conversation === conversationId;
  const live = owns ? browser.view : null;
  const card = live ?? restoredCard(record);
  if (card === null) return null;
  const driving = live?.state === "user-drive";
  return (
    <div className={driving ? styles.driveFull : undefined}>
      <BrowserSessionCard
        session={card}
        idleAgent={live !== null && live.state === "agent-drive" && !busy}
        fullscreen={driving}
        onResume={browser.resume}
        {...(live === null
          ? {}
          : { onRelay: browser.relay, onTakeover: browser.takeover })}
        refusal={browser.refusal}
        onFront={browser.front}
      />
    </div>
  );
}
