// One conversation. It asks before it spends, shows its work as it happens,
// and ends every purchase at a hold-to-sign — whether the turns come from the
// fixture reel or from a live agent-host run (see assistantTransport.ts).
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { WORK_NARRATION } from "./assistantScript.ts";
import { useAssistant, type ChatEntry } from "./useAssistant.ts";
import { useAssistantTransport } from "./useAssistantTransport.ts";
import { SandboxPane } from "./SandboxPane.tsx";
import { ActivityStream, type ThinkingMode } from "./ActivityStream.tsx";
import { Greeting } from "./Greeting.tsx";
import { Openers } from "./Openers.tsx";
import { OptionSet } from "./OptionSet.tsx";
import { HoldToBuy } from "./HoldToBuy.tsx";
import { Composer, type ComposerAction } from "./Composer.tsx";
import { LedgerNotice, TransportNotice } from "./TransportNotice.tsx";
import type { SessionStatus } from "./ChatHistory.tsx";
import { pickWebOption } from "../api/agent.ts";
import { rupeesRounded } from "../primitives/formatMoney.ts";
import { StreamText } from "./StreamText.tsx";
import { BillCard } from "./BillCard.tsx";
import styles from "./Chat.module.css";

export type ChatSessionProps = {
  offline: boolean;
  trust?: ReactNode;
  /** Which conversation in PTLM to rehydrate this transcript from. */
  conversationId: string | null;
  onTitle: (title: string) => void;
  onStatus: (status: SessionStatus) => void;
  /** Hidden sessions stay mounted; only the visible one may speak. */
  visible: boolean;
};

/** Marketplace titles run to a paragraph; a dock prompt gets the first clause. */
function shortTitle(title: string): string {
  const cut = title.split(/[,|(]/)[0]?.trim() ?? title;
  return cut.length > 64 ? `${cut.slice(0, 61)}…` : cut;
}

function Bubble({
  entry,
}: {
  entry: Extract<ChatEntry, { kind: "agent" | "buyer" }>;
}): JSX.Element {
  if (entry.kind === "buyer") {
    return <p className={`${styles.bubble} ${styles.buyer}`}>{entry.text}</p>;
  }
  return (
    <p className={styles.bubble}>
      <StreamText text={entry.text} />
    </p>
  );
}

export function ChatSession({
  offline,
  trust,
  conversationId,
  onTitle,
  onStatus,
  visible,
}: ChatSessionProps): JSX.Element {
  const transport = useAssistantTransport(conversationId);
  const chat = useAssistant(transport);
  const { entries, question, offering, options, awaiting, answer, sign } = chat;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // A tapped open-web card is chosen, not launched: the errand costs a window
  // and a wait, so "Go to the shop" is its own gesture at the dock.
  const [webLaunched, setWebLaunched] = useState(false);
  const [signed, setSigned] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  // Collapsed by default: the steps are a processing trace, not the answer.
  // One line shows what is happening; a tap opens the working.
  const [thinkMode, setThinkMode] = useState<ThinkingMode>("summary");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries.length, pickedId, confirmed, signed]);

  const firstBuyer = entries.find((e) => e.kind === "buyer");
  useEffect(() => {
    if (firstBuyer?.kind === "buyer") onTitle(firstBuyer.text);
  }, [firstBuyer, onTitle]);

  const status: SessionStatus = signed
    ? "signed"
    : entries.length > 0
      ? "in-progress"
      : "new";
  useEffect(() => onStatus(status), [status, onStatus]);

  // The most recent thing the agent said, for the opt-in read-aloud. A live
  // question outranks the last bubble: it is the sentence still waiting on an
  // answer, and so the one worth hearing.
  const lastAgent = entries.findLast((e) => e.kind === "agent");
  const spokenLine = !visible
    ? undefined
    : (question?.prompt ??
      (lastAgent?.kind === "agent" ? lastAgent.text : undefined));

  const chosen = options.find((o) => o.id === pickedId);
  /**
   * An open-web row is chosen but never *confirmed* here: there is no signed
   * quote behind it, so there is no cart for this platform to build and no
   * mandate to sign. Tapping it sends the agent back to that page in the
   * sandbox instead, and the run ends at the shop's own payment step. Letting
   * it fall through to the bill would offer a signature over a scraped number,
   * which is the one thing this whole surface exists to refuse.
   */
  const picked = chosen?.sourceUrl === undefined ? chosen : undefined;
  /** The open-web counterpart: chosen from a page price, so its next step is
   *  the shop's own window, never this platform's bill. */
  const webChosen = chosen?.sourceUrl !== undefined ? chosen : undefined;
  const stage = !offering
    ? "listening"
    : picked === undefined
      ? "pick"
      : !confirmed
        ? "confirm"
        : "sign";

  /**
   * Picking a platform option IS choosing it: the bill opens on the tap, with
   * the ceiling printed inside it and the hold as the one gesture left. The
   * Confirm-then-Review-the-bill chain made the shopper say the same thing
   * three times; "Change choice" under the sheet is the way back out.
   */
  function choose(optionId: string): void {
    setPickedId(optionId);
    const option = options.find((o) => o.id === optionId);
    if (option?.sourceUrl !== undefined) {
      // Chosen, not launched: the errand starts on "Go to the shop", and a
      // tap on a different card before or after that is the way back out.
      setWebLaunched(false);
      return;
    }
    // The tap reaches the server: the standing cart is rebuilt for this
    // card, and the bill's total follows the cart beat. Without this the
    // sheet showed the tapped card while the signature released the run's
    // own default: what you see must be what you sign.
    void pickWebOption(optionId, conversationId);
    setConfirmed(true);
    setBillOpen(true);
  }

  function changeChoice(): void {
    setPickedId(null);
    setConfirmed(false);
    setBillOpen(false);
  }

  /** The launch is its own gesture: the errand costs a browser window and a
   *  wait, so a tap picks and this confirms. */
  function goToShop(): void {
    if (webChosen === undefined) return;
    void pickWebOption(webChosen.id, conversationId);
    setWebLaunched(true);
  }

  /** The rollback. The cards come back to the dock; a new pick queues behind
   *  whatever the window is still doing and then takes over. */
  function switchProduct(): void {
    setPickedId(null);
    setWebLaunched(false);
  }

  /**
   * What voice mode shows instead of describing. Hands-free is not eyes-free:
   * being told about three shoes you cannot see is worse than being shown them.
   * Signing is deliberately absent — a signature is a held gesture, never a
   * spoken one, so voice can bring you to the bill and your hand still signs it.
   */
  const voiceStage =
    options.length > 0 && !signed ? (
      <OptionSet
        options={options}
        capPaise={chat.covenant?.capPaise}
        selectedId={pickedId ?? undefined}
        onAsk={choose}
      />
    ) : undefined;

  // The live set sits in the dock; the transcript keeps the evidence line.
  const optionsLive =
    options.length > 0 && !signed && !webLaunched && question === null;

  /** Every reply ends in something tappable. A question always carries "You
   *  decide" so the agent's judgement is one tap away; a live option set
   *  carries the refinements a shopper actually reaches for next. */
  const replies: ComposerAction[] =
    question !== null
      ? [
          ...question.replies.map((r) => ({
            label: r,
            onClick: () => answer(r),
          })),
          { label: "You decide", onClick: () => answer("You decide.") },
        ]
      : webChosen !== undefined && webLaunched && !signed
        ? [{ label: "Switch product", onClick: switchProduct }]
        : (stage === "confirm" || stage === "sign") && !signed
          ? [{ label: "Change choice", onClick: changeChoice }]
          : optionsLive && pickedId === null
            ? [
                {
                  label: "Cheaper",
                  onClick: () => answer("Find me cheaper ones."),
                },
                {
                  label: "Better rated",
                  onClick: () => answer("Find better rated ones."),
                },
                {
                  label: "None of these",
                  onClick: () =>
                    answer("None of these fit. Look for different ones."),
                },
              ]
            : [];

  /**
   * Everything the run can be waiting on a person for, in one place — because
   * that is where a shopper looks. A question, a choice of option, an address
   * to confirm and a signature are four different asks and one habit: the box
   * you type into becomes the thing being asked of you.
   */
  const awaitingPick = options.length > 0 && pickedId === null && !signed;
  const fromWeb = options.some((option) => option.sourceUrl !== undefined);
  const askPrompt =
    awaiting === "intent"
      ? "Nothing has been searched for yet: that starts when you sign."
      : (question?.prompt ??
        (webChosen !== undefined && !webLaunched
          ? `${shortTitle(webChosen.title)}: ${rupeesRounded(webChosen.pricePaise)} on ${webChosen.merchant}. Go and put it in that shop's basket?`
          : awaitingPick
            ? fromWeb
              ? "Pick one below and I will go and do that in the window."
              : "Pick one below and I will build the cart."
            : undefined));
  /**
   * DECISION: the pick state moves the *ask* to the composer and leaves the
   * cards where they are. Rendering the strip in the dock as well would put two
   * identical stacks of the same options on one screen — the duplication the
   * shopper has already complained about — and the contract is one live option
   * set. The transcript carries the evidence; the dock says what to do with it.
   */
  const dockStage =
    awaiting === "intent" ? "intent" : question !== null ? "ask" : stage;

  function renderEntry(entry: ChatEntry, i: number): JSX.Element {
    if (entry.kind === "work") {
      return (
        <ActivityStream
          key={i}
          activities={entry.activities}
          done={entry.done}
          mode={thinkMode}
          onMode={setThinkMode}
          thinking={
            WORK_NARRATION[
              entry.activities[entry.activities.length - 1]?.id ?? ""
            ]
          }
        />
      );
    }
    if (entry.kind === "folded") {
      return (
        <p key={i} className={styles.folded}>
          {entry.considered} considered earlier
        </p>
      );
    }
    if (entry.kind === "offer") {
      if (signed && picked !== undefined) {
        return (
          <p key={i} className={styles.folded}>
            Chose {picked.title}, {rupeesRounded(picked.pricePaise)} from{" "}
            {picked.merchant} · {Math.max(options.length - 1, 0)} others
            considered
          </p>
        );
      }
      if (webChosen !== undefined && webLaunched) {
        return (
          <p key={i} className={styles.folded}>
            Going for {shortTitle(webChosen.title)} ·{" "}
            {Math.max(options.length - 1, 0)} others considered. “Switch
            product” brings them back
          </p>
        );
      }
      // The strip itself lives in the dock while the pick is the live ask:
      // the transcript keeps the claim, the composer holds the choice.
      return (
        <div key={i} className={styles.offer}>
          <p className={styles.offerLine}>
            {options.length} fit, in the order I would buy them. Nobody paid
            to be here.
          </p>
        </div>
      );
    }
    return <Bubble key={i} entry={entry} />;
  }

  return (
    <div className={styles.chat}>
      <div className={styles.scroll}>
        <div
          className={
            entries.length === 0
              ? `${styles.thread} ${styles.threadFresh}`
              : styles.thread
          }
        >
          <TransportNotice status={chat.status} detail={chat.notice} />
          <LedgerNotice />
          {entries.length === 0 && (
            <>
              <Greeting />
              <Openers onPick={answer} />
            </>
          )}
          {entries.map(renderEntry)}
          {stage === "confirm" && picked !== undefined && (
            <p className={styles.bubble}>
              <StreamText
                text={`${picked.title}, ${rupeesRounded(picked.pricePaise)}, from ${picked.merchant}. Shall I build the cart?`}
              />
            </p>
          )}
          <SandboxPane
            active={entries.length > 0 && !signed}
            conversationId={conversationId}
            record={chat.sandbox}
            busy={chat.running}
          />
          {stage === "sign" && !billOpen && !signed && (
            <p className={styles.bubble}>
              <StreamText text="Your bill is ready." />
            </p>
          )}
          {signed && picked !== undefined && !billOpen && (
            <BillCard
              picked={picked}
              covenant={chat.covenant}
              cartTotalPaise={chat.cart?.totalPaise ?? null}
              txnId={chat.txnId}
              signedView
              onSigned={() => undefined}
            />
          )}
          {signed && trust !== undefined && (
            <div className={styles.trust}>{trust}</div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      {billOpen && picked !== undefined && (
        <div className={styles.sheetLayer}>
          <button
            type="button"
            className={styles.scrim}
            aria-label="Close the bill"
            onClick={() => setBillOpen(false)}
          />
          <BillCard
            dock
            picked={picked}
            covenant={chat.covenant}
            cartTotalPaise={chat.cart?.totalPaise ?? null}
            txnId={chat.txnId}
            onSign={() => sign("cart")}
            onSigned={() => {
              // The sheet stays up: the hand that signed is the hand that
              // pays, so the same popup morphs into the payment step rather
              // than stranding "Pay now" down in the transcript. Closing it
              // is the shopper's gesture, and the signed record in the
              // thread is waiting behind the scrim either way.
              setSigned(true);
            }}
          />
        </div>
      )}
      <Composer
        voiceStage={voiceStage}
        blocked={offline}
        onSend={answer}
        speakText={spokenLine}
        actions={replies}
        stage={dockStage}
        prompt={askPrompt}
        picker={
          optionsLive ? (
            <OptionSet
              options={options}
              capPaise={chat.covenant?.capPaise}
              selectedId={pickedId ?? undefined}
              onAsk={choose}
            />
          ) : undefined
        }
        placeholder={question === null ? undefined : "Answer here…"}
        openLabel={question === null ? undefined : "Type your answer"}
        primary={
          awaiting === "intent" ? (
            <HoldToBuy
              label="Hold to sign your limits"
              busy={false}
              onComplete={() => void sign("intent")}
            />
          ) : webChosen !== undefined && !webLaunched ? (
            <button
              type="button"
              className={styles.confirm}
              onClick={goToShop}
            >
              Go to the shop
            </button>
          ) : stage === "confirm" ? (
            <button
              type="button"
              className={styles.confirm}
              onClick={() => setConfirmed(true)}
            >
              Confirm
            </button>
          ) : stage === "sign" && !billOpen && !signed ? (
            <button
              type="button"
              className={styles.confirm}
              onClick={() => setBillOpen(true)}
            >
              Review the bill
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
