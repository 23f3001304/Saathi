import { useState } from "react";
import { createItem, setFloor, updateItem } from "../api/merchantWrites.ts";
import { joinCopy } from "./productUrl.ts";
import { floorPaiseOf, paiseFromRupees } from "./itemDraft.ts";
import type { DraftFields } from "./itemDraft.ts";

export type ListingWrites = {
  busy: boolean;
  failure: string;
  create: (draft: DraftFields) => void;
  edit: (itemId: string, draft: DraftFields, wasPaise: number | null) => void;
};

/**
 * The product page and the image are composed into the Razorpay description
 * here, on the one path that writes it, so a listing and its pointers cannot
 * be saved apart — and so changing a picture is the same signed inventory
 * write as changing a price, with no path around it.
 *
 * The floor is deliberately *not* in this body. It is not a Razorpay item
 * field and it is not a claim; it is a bound the gateway will hold the
 * merchant's own agent to, so it is its own signed statement over its own
 * route, with its own ledger event.
 */
function bodyOf(draft: DraftFields) {
  return {
    name: draft.name.trim(),
    description: joinCopy(draft.description, draft.productUrl, draft.imageUrl),
    amountPaise: paiseFromRupees(draft.rupees) ?? 0,
    currency: "INR",
  };
}

/**
 * The listing, then its band — in that order, because a floor is declared
 * against a listed price and the gateway refuses one above it. A new listing
 * has no id until the first write returns, which is the other reason the two
 * cannot be one call.
 *
 * The second write is skipped when the band did not move. Saving a typo fix
 * would otherwise re-declare the same authority, and every listing ever added
 * would file a "floor cleared" event for a floor that never existed.
 */
async function withFloor(
  draft: DraftFields,
  wasPaise: number | null,
  write: () => Promise<{ itemId: string }>,
): Promise<unknown> {
  const written = await write();
  const floorPaise = floorPaiseOf(draft);
  return floorPaise === wasPaise
    ? written
    : setFloor(written.itemId, floorPaise);
}

/**
 * Both writes carry a merchant ES256 signature over the canonical base string.
 * This hook does not decide whether that is possible — it calls, and a device
 * with no key fails at `signatureHeader` with a sentence saying so, rather
 * than the UI quietly pretending the write went out.
 */
export function useListingWrites(onWritten: () => void): ListingWrites {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  function run(action: () => Promise<unknown>): void {
    setBusy(true);
    setFailure("");
    action()
      .then(onWritten)
      .catch((cause: unknown) => {
        setFailure(
          cause instanceof Error ? cause.message : "That did not save.",
        );
      })
      .finally(() => setBusy(false));
  }

  return {
    busy,
    failure,
    create: (draft) =>
      run(() => withFloor(draft, null, () => createItem(bodyOf(draft)))),
    edit: (itemId, draft, wasPaise) =>
      run(() =>
        withFloor(draft, wasPaise, () =>
          updateItem(itemId, { ...bodyOf(draft), active: draft.active }),
        ),
      ),
  };
}
