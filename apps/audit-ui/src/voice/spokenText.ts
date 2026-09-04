import { parseMarkdown, type Block, type Span } from "../conversation/markdown.ts";

/**
 * The reply as it should be heard rather than seen.
 *
 * DECISION: the same parsed document the screen renders, rendered as audio.
 * The synthesizer was handed the model's raw text, so "I would buy the
 * **Lexar NM790**" reached the shopper's ears with its asterisks in it, and a
 * bulleted list arrived as a run-on sentence with hyphens in the middle.
 *
 * This is a renderer, not a filter on the model. Nothing here judges what was
 * said or rewrites a word of it: emphasis is dropped because emphasis is a
 * visual device with no spoken form, and a bullet becomes a sentence boundary
 * because that is what a bullet sounds like. The model writes one reply; the
 * screen and the speaker each render it their own way.
 */
function spanText(span: Span): string {
  // Every span kind carries its text; the kind is how it LOOKS, and none of
  // the four looks survive into audio. A link is read as its words, never
  // as its href - nobody wants a URL spelt at them.
  return span.text;
}

function blockText(block: Block): string {
  const said = block.spans.map(spanText).join("").trim();
  if (said === "") return "";
  // A numbered step keeps its marker: "one", "two" is how a spoken list is
  // followed, and it is the only marker a listener can hold on to.
  return block.kind === "step" ? `${block.marker} ${said}` : said;
}

/**
 * What goes between two spoken blocks.
 *
 * DECISION: between, never after. Ending every block with a full stop put one
 * on the end of the reply too, so a one-paragraph answer reached the
 * synthesizer with a character the model did not write. A separator earns its
 * place by stopping two list items running into one sentence; a terminator on
 * the last block earns nothing and edits the reply.
 */
function joinedWith(said: string): string {
  return /[.!?…।:,]$/.test(said) ? " " : ". ";
}

export function spokenText(markdown: string): string {
  const blocks = parseMarkdown(markdown)
    .map(blockText)
    .filter((said) => said !== "");
  return blocks
    .reduce(
      (whole, said, at) =>
        at === 0 ? said : whole + joinedWith(whole) + said,
      "",
    )
    .trim();
}
