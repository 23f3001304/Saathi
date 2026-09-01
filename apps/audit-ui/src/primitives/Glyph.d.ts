import type { JSX } from "react";
export type GlyphName = "hexagon" | "chain" | "shield" | "inspect" | "chevron" | "replay" | "check" | "cross" | "flag" | "range";
type GlyphProps = {
    name: GlyphName;
    size?: number;
};
/** One hand-cut glyph set; never Lucide/Phosphor/etc. (§0 non-negotiables). */
export declare function Glyph({ name, size }: GlyphProps): JSX.Element;
export {};
//# sourceMappingURL=Glyph.d.ts.map