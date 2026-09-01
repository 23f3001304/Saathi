import type { ChangeEvent, JSX } from "react";
import {
  DETECT,
  LANGUAGE_CHOICES,
  type LanguageChoice,
} from "./detectedLanguage.ts";
import { isVoiceLanguage } from "./languages.ts";
import type { VoiceLanguage } from "./ports.ts";
import styles from "./VoiceBar.module.css";

type LanguagePickerProps = {
  value: LanguageChoice;
  /** What the engine last reported hearing, shown on the "Detect" row. */
  detected: VoiceLanguage | null;
  disabled: boolean;
  onChange: (choice: LanguageChoice) => void;
};

function choiceOf(value: string): LanguageChoice | null {
  if (value === DETECT) return DETECT;
  return isVoiceLanguage(value) ? value : null;
}

/**
 * Someone who spoke Tamil and was answered in Tamil should be able to see that
 * the machine knew which language that was. The row they are already on says
 * so, which is quieter than a banner and lands in the place they would look.
 */
function detectLabel(detected: VoiceLanguage | null): string {
  const row = LANGUAGE_CHOICES.find((option) => option.code === detected);
  return row === undefined ? "Detect" : `Detect · ${row.endonym}`;
}

/**
 * A native `<select>` on purpose. It is keyboard-operable, screen-reader
 * literate and type-ahead searchable everywhere, for free — and on a phone it
 * opens the platform's own wheel, which is what someone picking मराठी at a bus
 * stop actually wants. A bespoke listbox would be prettier and worse.
 */
export function LanguagePicker({
  value,
  detected,
  disabled,
  onChange,
}: LanguagePickerProps): JSX.Element {
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const next = choiceOf(event.target.value);
    if (next !== null) onChange(next);
  }

  return (
    <select
      className={styles.language}
      value={value}
      disabled={disabled}
      aria-label="Language for speaking and listening"
      onChange={handleChange}
    >
      {LANGUAGE_CHOICES.map((option) => (
        <option key={option.code} value={option.code}>
          {option.code === DETECT ? detectLabel(detected) : option.endonym}
        </option>
      ))}
    </select>
  );
}
