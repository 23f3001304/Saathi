// §2.1 — the conversation column. Fixture-scripted for this build (the
// brief: "buyer-chat pane wired to fixture data for now"); the real
// agent-host SSE client (api/agent.ts) slots in without changing this tree.
import { useState, type JSX, type ReactNode } from "react";
import type { ChatBeat } from "./chatScript.ts";
import { HAPPY_CHAT_SCRIPT } from "./chatScript.ts";
import { useChatPlayer } from "./useChatPlayer.ts";
import { IntentCard, type IntentCardState } from "./IntentCard.tsx";
import { Message } from "./Message.tsx";
import { SortKeyBanner } from "./SortKeyBanner.tsx";
import { Researching } from "./Researching.tsx";
import { OptionSet } from "./OptionSet.tsx";
import { CartProposal, type CartProposalState } from "./CartProposal.tsx";
import { HoldToBuy } from "./HoldToBuy.tsx";
import { type ComposerAction, Composer } from "./Composer.tsx";
import { rupeesRounded } from "../primitives/formatMoney.ts";
import type { OptionRowData } from "./chatScript.ts";
import styles from "./Conversation.module.css";

type ConversationProps = {
  offline: boolean;
  /** The collapsed Audit Instrument, rendered in flow under the cart. */
  trust?: ReactNode;
  onRequestSign: (onSigned: () => void) => void;
  onInspectDigest: () => void;
};

function intentState(beats: ChatBeat[]): {
  state: IntentCardState;
  description?: string;
  capPaise?: number;
  thumbprint?: string;
} {
  const signed = [...beats].reverse().find((b) => b.kind === "intent-signed");
  if (signed?.kind === "intent-signed")
    return {
      state: "signed",
      capPaise: signed.capPaise,
      thumbprint: signed.thumbprint,
    };
  const draft = [...beats].reverse().find((b) => b.kind === "intent-draft");
  if (draft?.kind === "intent-draft")
    return { state: "draft", description: draft.description };
  return { state: "empty" };
}

function latestSortKey(
  beats: ChatBeat[],
): Extract<ChatBeat, { kind: "sort-key" }> | undefined {
  return [...beats]
    .reverse()
    .find(
      (b): b is Extract<ChatBeat, { kind: "sort-key" }> =>
        b.kind === "sort-key",
    );
}

const RESEARCH_STEPS = [
  { key: "covenant", label: "Your covenant" },
  { key: "catalog", label: "Catalog" },
  { key: "quote", label: "Signed quote" },
  { key: "cart", label: "Cart + digest" },
] as const;

const RESEARCH_LABEL: Record<number, string> = {
  0: "Reading your covenant…",
  1: "Reading the catalog. Listing copy is a claim, not a price.",
  2: "Asking the merchant to sign a quote I can hold them to…",
  3: "Building the cart and hashing the memories that justify it…",
};

const DOCK_PROMPT: Partial<Record<string, string>> = {
  pick: "Which one should I buy?",
  confirm: "Confirm this, and I will build the cart.",
  sign: "Hold the button to sign. Nothing is charged until you do.",
};

/** The choice, restated once, so confirming is not a leap of faith. */
function PickedSummary({ option }: { option: OptionRowData }): JSX.Element {
  return (
    <p className={styles.picked}>
      <span className={styles.pickedTitle}>{option.title}</span>
      <span className={styles.pickedMeta}>
        {option.merchant} · {rupeesRounded(option.pricePaise)}
        {option.quoteSigned === true ? " · signed quote" : " · unverified"}
      </span>
    </p>
  );
}

export function Conversation({
  offline,
  trust,
  onRequestSign,
  onInspectDigest,
}: ConversationProps): JSX.Element {
  const beats = useChatPlayer(HAPPY_CHAT_SCRIPT);
  const [cartState, setCartState] = useState<CartProposalState>("proposed");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const intent = intentState(beats);
  const sortKey = latestSortKey(beats);
  const optionsBeat = [...beats].reverse().find((b) => b.kind === "options");
  const cartBeat = [...beats].reverse().find((b) => b.kind === "cart");
  const pending = beats.length < HAPPY_CHAT_SCRIPT.length;
  const researchIndex =
    optionsBeat !== undefined
      ? 3
      : sortKey !== undefined
        ? 2
        : intent.state === "signed"
          ? 1
          : 0;

  // The dock is the picker. It asks one question at a time and transforms as
  // the buyer answers it: choose an option, confirm the choice, then commit.
  // Nothing is duplicated into the transcript, and nothing is asked twice.
  const options = optionsBeat?.kind === "options" ? optionsBeat.options : [];
  const picked = options.find((o) => o.id === pickedId);
  const stage: "idle" | "pick" | "confirm" | "sign" =
    picked !== undefined
      ? confirmed
        ? "sign"
        : "confirm"
      : options.length > 0
        ? "pick"
        : "idle";

  const dockActions: ComposerAction[] =
    stage === "confirm"
      ? [{ label: "Change choice", onClick: () => setPickedId(null) }]
      : [];

  function handleSign(): void {
    setCartState("signing");
    onRequestSign(() => setCartState("verifying"));
  }

  return (
    <div className={styles.column} aria-live="polite">
      <div className={styles.scroll}>
        <div className={styles.stack}>
          <IntentCard
            {...intent}
            onSign={() => onRequestSign(() => undefined)}
          />
          {beats
            .filter((b) => b.kind === "message")
            .map(
              (b, i) =>
                b.kind === "message" && (
                  <Message
                    key={i}
                    text={b.text}
                    from="agent"
                    variant={b.variant}
                  />
                ),
            )}
          {sortKey !== undefined && optionsBeat?.kind === "options" && (
            <SortKeyBanner
              sortKey={sortKey.sortKey}
              memoryLabel={sortKey.label}
            />
          )}
          {confirmed && cartBeat?.kind === "cart" && (
            <CartProposal
              state={cartState}
              itemCount={cartBeat.itemCount}
              totalPaise={cartBeat.totalPaise}
              justifiedByCount={4}
              quoteSigOk={cartBeat.quoteOk}
              digest={cartBeat.digest}
              onInspectDigest={onInspectDigest}
            />
          )}
          {pending && (
            <Researching
              label={RESEARCH_LABEL[researchIndex] ?? ""}
              steps={[...RESEARCH_STEPS]}
              activeIndex={researchIndex}
            />
          )}
          {/* Nothing has been checked until a cart exists; claiming otherwise
              would be the one lie this whole screen exists to prevent. */}
          {confirmed && trust !== undefined && (
            <div className={styles.trust}>{trust}</div>
          )}
        </div>
      </div>
      <Composer
        blocked={offline}
        onSend={() => undefined}
        actions={dockActions}
        stage={stage}
        prompt={DOCK_PROMPT[stage]}
        picker={
          stage === "pick" ? (
            <OptionSet
              options={options}
              selectedId={pickedId ?? undefined}
              onAsk={setPickedId}
            />
          ) : stage === "confirm" && picked !== undefined ? (
            <PickedSummary option={picked} />
          ) : undefined
        }
        primary={
          stage === "confirm" ? (
            <button
              type="button"
              className={styles.confirm}
              onClick={() => setConfirmed(true)}
            >
              Confirm
            </button>
          ) : stage === "sign" &&
            (cartState === "proposed" || cartState === "signing") ? (
            <HoldToBuy
              label={cartState === "signing" ? "Signing…" : "Hold to sign"}
              busy={cartState === "signing"}
              onComplete={handleSign}
            />
          ) : undefined
        }
      />
    </div>
  );
}
