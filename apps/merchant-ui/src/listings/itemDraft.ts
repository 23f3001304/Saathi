import { safeImageUrl, safeProductUrl, splitCopy } from "./productUrl.ts";
import type { MerchantItemView } from "../api/merchantTypes.ts";

// The merchant types rupees; the wire carries paise. There is no float on the
// path between them — the fraction is padded, never multiplied — for the same
// reason `Money.fromMajorUnits` does it that way on the server.
const RUPEES = /^(\d+)(?:\.(\d{1,2}))?$/;

const MINOR_DIGITS = 2;

/** `null` for anything that is not a plain rupee amount: no silent coercion. */
export function paiseFromRupees(value: string): number | null {
  const parsed = RUPEES.exec(value.trim().replace(/[,\s]/g, ""));
  if (parsed === null) return null;
  const [, major = "0", fraction = ""] = parsed;
  const paise = Number(`${major}${fraction.padEnd(MINOR_DIGITS, "0")}`);
  return Number.isSafeInteger(paise) ? paise : null;
}

export function rupeesFromPaise(paise: number): string {
  const digits = Math.abs(paise)
    .toString()
    .padStart(MINOR_DIGITS + 1, "0");
  return `${digits.slice(0, -MINOR_DIGITS)}.${digits.slice(-MINOR_DIGITS)}`;
}

export type DraftFields = {
  name: string;
  description: string;
  /** Where the product actually lives. We point at it; we do not hold it. */
  productUrl: string;
  /** The merchant's own picture of it, on the merchant's own host. Same rule. */
  imageUrl: string;
  rupees: string;
  /**
   * The lowest an agent may settle at without asking. Blank is not zero and
   * not the list price — it is *no discount authority at all*, which is what a
   * shopkeeper who has never thought about this should get.
   */
  floorRupees: string;
  active: boolean;
};

export function emptyDraft(): DraftFields {
  return {
    name: "",
    description: "",
    productUrl: "",
    imageUrl: "",
    rupees: "",
    floorRupees: "",
    active: true,
  };
}

export function draftOf(item: MerchantItemView): DraftFields {
  const split = splitCopy(item.description);
  return {
    name: item.name,
    description: split.copy,
    productUrl: split.productUrl ?? "",
    imageUrl: split.imageUrl ?? "",
    rupees: rupeesFromPaise(item.amountPaise),
    floorRupees:
      item.floorPaise === null ? "" : rupeesFromPaise(item.floorPaise),
    active: item.active,
  };
}

/** The band, in paise, or `null` when the merchant has authorised no discount. */
export function floorPaiseOf(draft: DraftFields): number | null {
  return draft.floorRupees.trim() === ""
    ? null
    : paiseFromRupees(draft.floorRupees);
}

/**
 * What a draft is missing, as a sentence. An empty string means it is ready:
 * the caller renders the message and disables the button on the same value, so
 * the two can never disagree about whether the form is submittable.
 */
export function draftProblem(draft: DraftFields): string {
  if (draft.name.trim() === "") return "A listing needs a name.";
  if (paiseFromRupees(draft.rupees) === null) {
    return "A price is rupees, with at most two decimal places.";
  }
  if (unusable(draft.productUrl, safeProductUrl)) {
    return "A product page needs a full web address, starting with https.";
  }
  if (unusable(draft.imageUrl, safeImageUrl)) {
    return "A product image is a full https address.";
  }
  return floorProblem(draft);
}

/**
 * A floor above the list price is refused rather than quietly narrowed: the
 * gateway refuses it too, and a console that silently repaired the number
 * would be granting an authority the shopkeeper did not describe.
 */
function floorProblem(draft: DraftFields): string {
  if (draft.floorRupees.trim() === "") return "";
  const floor = paiseFromRupees(draft.floorRupees);
  const list = paiseFromRupees(draft.rupees);
  if (floor === null || floor < 1) {
    return "A floor is rupees, with at most two decimal places.";
  }
  if (list !== null && floor > list) {
    return "A floor cannot be above your own listed price.";
  }
  return "";
}

/** Written but unreadable. Blank is not a problem; blank is just no pointer. */
function unusable(
  raw: string,
  read: (value: string) => string | null,
): boolean {
  return raw.trim() !== "" && read(raw) === null;
}
