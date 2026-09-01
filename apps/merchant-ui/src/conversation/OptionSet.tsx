import { useState, type JSX } from "react";
import { OptionRow } from "./OptionRow.tsx";
import type { ChoiceOption } from "../assistant/turn.ts";
import styles from "./OptionSet.module.css";

export type OptionSetProps = {
  options: readonly ChoiceOption[];
  onPick: (option: ChoiceOption) => void;
};

/**
 * A question with something to tap, the way the shopper's app asks one. Every
 * option stays on screen and every card is the same weight; choosing one marks
 * it and the answer arrives as the next turn.
 */
export function OptionSet({ options, onPick }: OptionSetProps): JSX.Element {
  const [pickedId, setPickedId] = useState<string | null>(null);

  return (
    <div className={styles.set}>
      <div className={styles.grid} role="group" aria-label="Your listings">
        {options.map((option) => (
          <OptionRow
            key={option.id}
            option={option}
            selected={option.id === pickedId}
            onPick={() => {
              setPickedId(option.id);
              onPick(option);
            }}
          />
        ))}
      </div>
    </div>
  );
}
