import type { JSX } from "react";
import type { OptionRowData } from "./chatScript.ts";
type OptionRowProps = {
    option: OptionRowData;
    selected: boolean;
    onAsk: () => void;
};
export declare function OptionRow({ option, selected, onAsk, }: OptionRowProps): JSX.Element;
export {};
//# sourceMappingURL=OptionRow.d.ts.map