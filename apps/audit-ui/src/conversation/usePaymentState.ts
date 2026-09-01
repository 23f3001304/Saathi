import { useEffect, useState } from "react";

import { fetchPaymentState, type PaymentState } from "../api/paymentState.ts";

/** Slow enough to be free, fast enough that a paid bill lands while watched. */
const INTERVAL_MS = 4_000;

type Sink = (next: PaymentState) => void;

/**
 * One round: ask, report, and say whether another round is owed. A terminal
 * answer ends the loop; anything else — including a gateway that blinked —
 * keeps it going, because a failed request is not a failed payment.
 */
async function askOnce(txnId: string, sink: Sink): Promise<boolean> {
  try {
    const next = await fetchPaymentState(txnId);
    if (next === null) return false;
    sink(next);
    return next.settled === "waiting";
  } catch {
    return true;
  }
}

/**
 * The bill asks the gateway, on a timer, until the answer is terminal.
 *
 * A beat would have been the obvious vehicle and is the wrong one: the beat
 * hub is per-run and rebases on the next run, while the money can arrive
 * minutes after the conversation ended — and on reload there is no run at all.
 * Polling a read route survives all three, at the cost of a request every four
 * seconds while a bill is actually on screen.
 *
 * Nothing is cached across mounts on purpose. A restored bill re-asks and
 * shows whatever is true now; a client-side "paid" that outlived its evidence
 * is the one failure this feature exists to prevent.
 */
export function usePaymentState(
  txnId: string | null,
  /** Bump to re-ask at once — what checkout's success callback is good for. */
  nudge = 0,
): PaymentState | null {
  const [state, setState] = useState<PaymentState | null>(null);

  useEffect(() => {
    if (txnId === null) {
      setState(null);
      return undefined;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const round = async (): Promise<void> => {
      const again = await askOnce(txnId, (next) => {
        if (live) setState(next);
      });
      if (live && again) timer = setTimeout(() => void round(), INTERVAL_MS);
    };
    void round();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [txnId, nudge]);

  return state;
}
