import { FieldClassifier } from "@covenant/browser-drive";
import type { FieldSnapshot, Rect } from "@covenant/browser-drive";

export interface FieldView {
  readonly selector: string;
  readonly rect: Rect;
  readonly sensitive: boolean;
  readonly category: string | null;
}

/**
 * Boxes and verdicts only — never a value, never a label. It tells the card
 * where the protected regions are so it can say "that one is yours" before the
 * user clicks it, without this route becoming a way to read the page.
 */
export function fieldViews(
  fields: readonly FieldSnapshot[],
): readonly FieldView[] {
  const classifier = new FieldClassifier();
  return fields.map((snap) => {
    const verdict = classifier.classify(snap.descriptor);
    return {
      selector: snap.descriptor.selector,
      rect: snap.rect,
      sensitive: verdict.sensitive,
      category: verdict.category,
    };
  });
}
