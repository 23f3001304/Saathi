import { useEffect, useState, type JSX } from "react";
import { Composer } from "./Composer.tsx";
import { Greeting } from "./Greeting.tsx";
import { Openers } from "./Openers.tsx";
import { StreamText } from "./StreamText.tsx";
import { TurnPanel } from "./TurnPanel.tsx";
import { readTurns, writeTurns } from "./turnStore.ts";
import type { SessionStatus } from "./ChatHistory.tsx";
import {
  localTransport,
  type MerchantTransport,
} from "../assistant/transport.ts";
import type {
  Choice,
  ChoiceOption,
  PartialTurn,
  Proposal,
  Turn,
  TurnContext,
} from "../assistant/turn.ts";
import { useListingWrites } from "../listings/useListingWrites.ts";
import type { DraftFields } from "../listings/itemDraft.ts";
import type { ShopData } from "../data/useShopData.ts";
import styles from "./Chat.module.css";
import pills from "./ActivityStream.module.css";

/** Only the last turn's question is still open; older cards stay answerable. */
function pendingOf(turns: readonly Turn[]): Choice | null {
  const panel = turns[turns.length - 1]?.panel;
  return panel?.kind === "choice" ? panel.choice : null;
}

function statusOf(turns: readonly Turn[], signed: boolean): SessionStatus {
  if (signed) return "signed";
  return turns.length === 0 ? "new" : "in-progress";
}

export type ChatSessionProps = {
  data: ShopData;
  shopSlug: string;
  canSign: boolean;
  transport?: MerchantTransport;
  onOpenListing: (itemId: string) => void;
  /** Which conversation this transcript is filed under, for a reload. */
  conversationId: string | null;
  onTitle: (title: string) => void;
  onStatus: (status: SessionStatus) => void;
};

/**
 * One conversation with the shopkeeper's agent, in the shopper's room.
 *
 * Same rule on both sides of the market: what the agent said is prose, what it
 * did is an activity pill, and anything structured is the real component. And
 * the same guarantee — a change it drafts is inert until the merchant signs
 * it, exactly as a cart is until the buyer holds the pen down.
 */
export function ChatSession({
  data,
  shopSlug,
  canSign,
  transport = localTransport,
  onOpenListing,
  conversationId,
  onTitle,
  onStatus,
}: ChatSessionProps): JSX.Element {
  const [turns, setTurns] = useState<Turn[]>(() => readTurns(conversationId));
  const [signed, setSigned] = useState(false);
  const writes = useListingWrites(() => {
    setSigned(true);
    data.shelf.refetch();
    data.audit.refetch();
  });

  useEffect(() => {
    writeTurns(conversationId, turns);
  }, [conversationId, turns]);

  const opening = turns[0]?.asked;
  useEffect(() => {
    if (opening !== undefined) onTitle(opening);
  }, [opening, onTitle]);

  const status = statusOf(turns, signed);
  useEffect(() => onStatus(status), [status, onStatus]);

  function contextNow(): TurnContext {
    return { data, shopSlug, now: new Date(), pending: pendingOf(turns) };
  }

  function record(asked: string, partial: PartialTurn): void {
    setTurns((current) => [
      ...current,
      { ...partial, id: current.length, asked },
    ]);
  }

  function ask(asked: string): void {
    void transport
      .ask(asked, contextNow())
      .then((partial) => record(asked, partial));
  }

  function pick(choice: Choice, option: ChoiceOption): void {
    void transport
      .pick(option.id, choice, contextNow())
      .then((partial) => record(option.name, partial));
  }

  /** The band already standing, so an edit that leaves it alone writes nothing. */
  function floorOf(itemId: string): number | null {
    const item = data.shelf.data?.items.find((row) => row.itemId === itemId);
    return item?.floorPaise ?? null;
  }

  function sign(proposal: Proposal, draft: DraftFields): void {
    if (proposal.kind === "create") writes.create(draft);
    else writes.edit(proposal.itemId, draft, floorOf(proposal.itemId));
  }

  const fresh = turns.length === 0;

  return (
    <div className={styles.chat}>
      <div className={styles.scroll}>
        <div
          className={
            fresh ? `${styles.thread} ${styles.threadFresh}` : styles.thread
          }
        >
          {fresh && (
            <>
              <Greeting />
              <Openers onPick={ask} />
            </>
          )}
          {turns.map((turn) => (
            <div className={styles.offer} key={turn.id}>
              <p className={`${styles.bubble} ${styles.buyer}`}>{turn.asked}</p>
              <p className={styles.bubble}>
                <StreamText text={turn.said} />
              </p>
              {turn.did.length > 0 && (
                <ul className={pills.stream}>
                  {turn.did.map((did) => (
                    <li className={pills.pill} key={did}>
                      {did}
                    </li>
                  ))}
                </ul>
              )}
              {turn.panel !== null && (
                <TurnPanel
                  panel={turn.panel}
                  data={data}
                  canSign={canSign}
                  busy={writes.busy}
                  onSign={sign}
                  onPick={pick}
                  onOpenListing={onOpenListing}
                />
              )}
            </div>
          ))}
          {writes.failure !== "" && (
            <p className={styles.offerLine}>{writes.failure}</p>
          )}
        </div>
      </div>
      <Composer blocked={false} onSend={ask} />
    </div>
  );
}
