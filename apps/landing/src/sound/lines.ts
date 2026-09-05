export type Beat =
  | "curtain"
  | "word-shopper"
  | "word-saathi"
  | "walk-keeper"
  | "walk-saathi"
  | "refusal-tout"
  | "refusal-saathi"
  | "bill";

/** Which recorded line each beat speaks; the tout has three tries. */
export const LINES: Record<Beat, readonly string[]> = {
  curtain: ["saathi-curtain"],
  "word-shopper": ["shopper-word"],
  "word-saathi": ["saathi-word"],
  "walk-keeper": ["shopkeeper-walk"],
  "walk-saathi": ["saathi-walk"],
  "refusal-tout": ["tout-refusal", "tout-again-1", "tout-again-2"],
  "refusal-saathi": ["saathi-refusal"],
  bill: ["saathi-bill"],
};

export function lineFile(beat: Beat, n = 0): string {
  const stems = LINES[beat];
  return `/voice/${stems[n % stems.length]}.mp3`;
}

export function isBeat(value: string | undefined): value is Beat {
  return value !== undefined && value in LINES;
}
