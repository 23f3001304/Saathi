/**
 * Which picture the page puts up, and the windows that come with it.
 *
 * The film is what the page shows. `?stage` asks for the built stage
 * instead, which is how the two are compared side by side and what the page
 * falls back to when there is no film to play. Everything the runtime reads
 * out of the script (which line is speaking, where the seal stands, which
 * line carries the title card and the doors, how long the invitation to
 * begin holds) comes from one of these two values, picked once, so a line
 * and a seal can never be read off two different clocks.
 */
import { remapAt, SCRIPT_FILM } from "../film/remap.ts";
import { sealWindow, toutStems, type SealWindow } from "./activeLine.ts";
import { BEGIN_UNTIL } from "./Begin.tsx";
import { SCRIPT, type Line } from "./script.ts";

export type ShowMode = "film" | "stage";

/** The query string picks the picture; the film is what a reader gets. */
export function requestedMode(search: string): ShowMode {
  return new URLSearchParams(search).has("stage") ? "stage" : "film";
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Windows {
  readonly script: readonly Line[];
  readonly seal: SealWindow | null;
  readonly tout: readonly string[];
  /** The last line, which carries the title card and the two doors. */
  readonly last: Line | null;
  readonly beginUntil: number;
  readonly nameOut: Span;
}

/** Where the name leaves, in the choreography's own time. */
const NAME_OUT: Span = { from: 0.06, to: 0.08 };

function windowsFor(
  script: readonly Line[],
  at: (progress: number) => number,
): Windows {
  return {
    script,
    seal: sealWindow(script),
    tout: toutStems(script),
    last: script.length > 0 ? script[script.length - 1] : null,
    beginUntil: at(BEGIN_UNTIL),
    nameOut: { from: at(NAME_OUT.from), to: at(NAME_OUT.to) },
  };
}

const FILM = windowsFor(SCRIPT_FILM, remapAt);
const STAGE = windowsFor(SCRIPT, (progress) => progress);

export function showWindows(mode: ShowMode): Windows {
  return mode === "film" ? FILM : STAGE;
}
