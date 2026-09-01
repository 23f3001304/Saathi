import { useState, type JSX } from "react";
import type { PendingAmendment } from "../covenant/amendmentModel.ts";
import {
  usePendingAmendments,
  withdrawAmendment,
} from "../covenant/pendingAmendments.ts";
import { signCovenant } from "../api/gateway.ts";
import { AmendmentProposal } from "./AmendmentProposal.tsx";

/**
 * Every amendment proposed in this conversation, and every one sealed in it.
 *
 * The pending half is read from the shared store, so it is the same list the
 * Rules screen is showing — sealing here removes it there, and discarding
 * there removes it here. The sealed half is kept locally, because a signed
 * amendment is no longer pending anywhere and the thread should still show
 * what was signed in it.
 */
export function AmendmentProposals(): JSX.Element | null {
  const pending = usePendingAmendments();
  const [sealed, setSealed] = useState<PendingAmendment[]>([]);

  function seal(amendment: PendingAmendment): void {
    setSealed((prev) => [...prev, amendment]);
    withdrawAmendment(amendment.id);
    // The browser holds no user key; the host signs the covenant route.
    void signCovenant("").catch(() => undefined);
  }

  if (pending.length === 0 && sealed.length === 0) return null;

  return (
    <>
      {sealed.map((amendment) => (
        <AmendmentProposal key={amendment.id} amendment={amendment} sealed />
      ))}
      {pending.map((amendment) => (
        <AmendmentProposal
          key={amendment.id}
          amendment={amendment}
          onSeal={() => seal(amendment)}
          onDiscard={() => withdrawAmendment(amendment.id)}
        />
      ))}
    </>
  );
}
