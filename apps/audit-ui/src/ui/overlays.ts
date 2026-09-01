// Shared overlay request shapes — O1 (SigningSheet) and O2 (DigestInspector)
// are reachable from both /  and /covenant (§1.3), so App.tsx owns the one
// mounted instance of each and screens just describe what they want shown.
import type { ConstraintLine } from "../covenant/SigningSheet.tsx";
import type { MemoryEntryView } from "../ledger/reducer.ts";

export type SigningRequest = {
  title: string;
  description: string;
  lines: ConstraintLine[];
  thumbprint: string;
  onSigned: () => void;
};

export type DigestRequest = {
  memories: MemoryEntryView[];
  claimedDigest: string;
  txnId: string;
  cartId: string;
};
