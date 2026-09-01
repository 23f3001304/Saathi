import { useEffect, useRef, type CSSProperties, type JSX } from "react";
import { parseMarkdown, type Block, type Span } from "./markdown.ts";
import styles from "./StreamText.module.css";

const PIGMENTS = ["#B4791B", "#14706A", "#B4441A", "#363499", "#A02D55"];

/**
 * Agent speech arrives word by word: a quick, clean fade with a slight
 * rise, nothing else. Under reduced motion the text is simply there.
 *
 * DECISION: the stagger is counted from the words that were already on
 * screen, not from the start of the sentence. The text now grows as the model
 * writes it, and a delay of `index × 38ms` across the whole message would have
 * laid a typewriter over a real stream — the fortieth word waiting a second
 * and a half after the model had already sent it. Every fragment fades in as
 * it lands, so the sentence keeps the model's own pace and no other.
 *
 * DECISION: markdown is parsed to a tree and rendered as elements. The model
 * writes it — the chat was showing "- **Kolam Run Gc9 road shoe**, UK 8" with
 * the asterisks in it — and the obvious fix, setting HTML, is the one thing
 * this surface must not do: merchant prose reaches here after passing through
 * a model, and a renderer that can emit a tag is a renderer that can be made
 * to emit one. Nothing below touches `dangerouslySetInnerHTML`.
 */

/** A running count, so the fade stagger is continuous across the whole reply. */
type Counter = { at: number; settled: number };

function Words({
  text,
  count,
}: {
  text: string;
  count: Counter;
}): JSX.Element {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => {
        const index = count.at + i;
        return (
          <span
            key={i}
            className={styles.word}
            style={
              {
                "--w": Math.max(0, index - count.settled),
                "--pigment": PIGMENTS[index % PIGMENTS.length],
              } as CSSProperties
            }
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

function Inline({
  spans,
  count,
}: {
  spans: readonly Span[];
  count: Counter;
}): JSX.Element {
  return (
    <>
      {spans.map((span, i) => {
        const words = <Words text={span.text} count={{ ...count }} />;
        count.at += span.text.split(" ").length;
        if (span.kind === "strong") return <strong key={i}>{words}</strong>;
        if (span.kind === "em") return <em key={i}>{words}</em>;
        if (span.kind === "code")
          return (
            <code key={i} className={styles.code}>
              {span.text}
            </code>
          );
        return <span key={i}>{words}</span>;
      })}
    </>
  );
}

function Blocks({
  blocks,
  count,
}: {
  blocks: readonly Block[];
  count: Counter;
}): JSX.Element {
  return (
    <>
      {blocks.map((block, i) => {
        const body = <Inline spans={block.spans} count={count} />;
        if (block.kind === "para") return <span key={i}>{body} </span>;
        return (
          <span key={i} className={styles.item}>
            <span className={styles.marker} aria-hidden="true">
              {block.kind === "step" ? `${block.marker}.` : "—"}
            </span>
            {body}
          </span>
        );
      })}
    </>
  );
}

export function StreamText({ text }: { text: string }): JSX.Element {
  const shown = useRef(0);
  const total = text.split(" ").length;
  const count: Counter = { at: 0, settled: shown.current };
  useEffect(() => {
    shown.current = total;
  });
  return (
    <span className={styles.stream}>
      <Blocks blocks={parseMarkdown(text)} count={count} />
    </span>
  );
}
