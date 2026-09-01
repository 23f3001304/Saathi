import { type JSX } from "react";
import type { OptionRowData } from "./chatScript.ts";
export type OptionSetProps = {
    options: OptionRowData[];
    /**
     * The option that ended up in the cart. Not a rank and not a promotion:
     * it names a decision the buyer has already taken, and its only effect is
     * to open that card's evidence first. Every option stays on screen.
     */
    inCartId?: string;
    /** A pick made outside the grid. the dock's choice chips. Wins when set. */
    selectedId?: string;
    onAsk: (optionId: string) => void;
};
/**
 * §2.1/§4.5. "Invariant enforced in the component, not by convention: no
 * `recommended`, `sponsored`, `badge`, or `highlighted` prop exists." That's
 * literal: no field here ranks, promotes or decorates a card. Card order is
 * the only encoding of rank, and `SortKeyBanner` (rendered by the caller,
 * always above this) says why that order is what it is.
 *
 * All options stay visible. Choosing one opens its evidence underneath -
 * the price history, the merchant's quote-honour rate, and why it matches
 * the buyer's own stated preference.
 */
export declare function OptionSet({ options, inCartId, selectedId, onAsk, }: OptionSetProps): JSX.Element;
//# sourceMappingURL=OptionSet.d.ts.map