// The agent writes markdown and the chat printed it: "- **Kolam Run Gc9 road
// shoe**, UK 8 — **₹1,999 listed price**", asterisks and all.
//
// This parses the small subset a shopping assistant actually emits — bullets,
// numbered steps, bold, italic, inline code — into a tree the renderer turns
// into React elements. It deliberately produces *data*, never HTML: nothing
// here reaches `dangerouslySetInnerHTML`, so a merchant description that
// travelled through the model and out into a bubble cannot become markup. The
// safest markdown renderer is one that has no way to emit a tag.
//
// It also has to survive streaming. Text arrives a fragment at a time, so a
// half-written `**bold` is the normal case, not an error: an unclosed
// delimiter is left as the literal characters and resolves itself when the
// closing one lands.

export type Span =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "em"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

export type Block =
  | { readonly kind: "para"; readonly spans: readonly Span[] }
  | { readonly kind: "bullet"; readonly spans: readonly Span[] }
  | {
      readonly kind: "step";
      readonly marker: string;
      readonly spans: readonly Span[];
    };

/** Longest delimiter first: `**` must be tried before `*`. */
const INLINE: ReadonlyArray<readonly [string, Span["kind"]]> = [
  ["**", "strong"],
  ["__", "strong"],
  ["`", "code"],
  ["*", "em"],
  ["_", "em"],
];

const WORD = /[A-Za-z0-9]/;

/**
 * Underscores open emphasis only at a word edge. `txn_50a77c00` and
 * `order_TWgXfRM` are identifiers, not italics — swallowing their underscores
 * rendered every transaction id in the chat as mangled slanted fragments.
 * Asterisks keep their intra-word behaviour; ids never carry those.
 */
function openerAt(
  text: string,
  at: number,
): readonly [string, Span["kind"]] | null {
  for (const [mark, kind] of INLINE) {
    if (!text.startsWith(mark, at)) continue;
    if (mark.startsWith("_") && at > 0 && WORD.test(text[at - 1] ?? "")) {
      continue;
    }
    return [mark, kind];
  }
  return null;
}

function push(spans: Span[], kind: Span["kind"], text: string): void {
  if (text === "") return;
  const last = spans[spans.length - 1];
  if (kind === "text" && last?.kind === "text") {
    spans[spans.length - 1] = { kind: "text", text: last.text + text };
    return;
  }
  spans.push({ kind, text } as Span);
}

/**
 * `[label](url)`, and only with an http(s) url. The href is the one string in
 * a bubble that can become a navigation, so anything else — `javascript:`,
 * `data:`, a relative path into this app — stays literal text and is thereby
 * inert. A half-streamed link renders as its characters until the `)` lands,
 * like every other unclosed delimiter here.
 */
const LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

function linkAt(line: string, at: number): readonly [Span, number] | null {
  if (line[at] !== "[") return null;
  const match = LINK.exec(line.slice(at));
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return [{ kind: "link", text: match[1], href: match[2] }, match[0].length];
}

export function parseSpans(line: string): readonly Span[] {
  const spans: Span[] = [];
  let plain = "";
  let at = 0;
  while (at < line.length) {
    const link = linkAt(line, at);
    if (link !== null) {
      push(spans, "text", plain);
      plain = "";
      spans.push(link[0]);
      at += link[1];
      continue;
    }
    const opener = openerAt(line, at);
    const close =
      opener === null ? -1 : line.indexOf(opener[0], at + opener[0].length);
    if (opener === null || close === -1) {
      plain += line[at];
      at += 1;
      continue;
    }
    push(spans, "text", plain);
    plain = "";
    push(spans, opener[1], line.slice(at + opener[0].length, close));
    at = close + opener[0].length;
  }
  push(spans, "text", plain);
  return spans;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const STEP = /^\s*(\d{1,2})[.)]\s+(.*)$/;

function blockFor(line: string): Block | null {
  const bullet = BULLET.exec(line);
  if (bullet?.[1] !== undefined) {
    return { kind: "bullet", spans: parseSpans(bullet[1]) };
  }
  const step = STEP.exec(line);
  if (step?.[1] !== undefined && step[2] !== undefined) {
    return { kind: "step", marker: step[1], spans: parseSpans(step[2]) };
  }
  return null;
}

/**
 * A model that means a list often writes it on one line: "I found one
 * candidate: - Gc9 road shoe - ₹1,999 - Refundable". Splitting on " - " as
 * well as on newlines is what makes that read as a list rather than a run-on.
 */
function lines(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) =>
      BULLET.test(line) ? [line] : line.split(/\s+-\s+(?=\S)/),
    )
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function parseMarkdown(text: string): readonly Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "para", spans: parseSpans(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const [index, line] of lines(text).entries()) {
    // A dash-separated fragment after the first is a list item even without a
    // leading marker: the split above consumed the marker that made it one.
    const looksListy = index > 0 && /\s+-\s+/.test(text);
    const block = blockFor(line) ?? (looksListy ? blockFor(`- ${line}`) : null);
    if (block === null) {
      paragraph.push(line);
      continue;
    }
    flush();
    blocks.push(block);
  }
  flush();
  return blocks;
}
