/**
 * The argument fields that are prose addressed to the shopper.
 *
 * Every buyer turn-plan tool writes what the agent says into `reply`; the
 * money tools have no such field, so nothing a payment call carries can reach
 * a bubble through here. The list is the allow-list: a field not named here is
 * never shown, whatever it holds.
 */
export const SPOKEN_ARGUMENT_FIELD = "reply";

const OPENING = new RegExp(`[{,]\\s*"${SPOKEN_ARGUMENT_FIELD}"\\s*:\\s*"`);

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

const UNICODE_ESCAPE_LENGTH = 6;

interface Escape {
  readonly text: string;
  readonly length: number;
}

/** `null` while the escape is still arriving, so a half-written `é` is
 *  held back rather than shown as backslash-u. */
function escapeAt(body: string, at: number): Escape | null {
  const marker = body[at + 1];
  if (marker === undefined) {
    return null;
  }
  if (marker === "u") {
    const hex = body.slice(at + 2, at + UNICODE_ESCAPE_LENGTH);
    if (hex.length < 4) {
      return null;
    }
    const code = Number.parseInt(hex, 16);
    return Number.isNaN(code)
      ? null
      : { text: String.fromCharCode(code), length: UNICODE_ESCAPE_LENGTH };
  }
  const simple = SIMPLE_ESCAPES[marker];
  return simple === undefined ? null : { text: simple, length: 2 };
}

/** Decodes the JSON string body up to its closing quote, or up to the last
 *  character that is certainly complete. */
function decode(body: string): string {
  let out = "";
  let at = 0;
  while (at < body.length) {
    const char = body[at] ?? "";
    if (char === '"') {
      return out;
    }
    if (char !== "\\") {
      out += char;
      at += 1;
      continue;
    }
    const escape = escapeAt(body, at);
    if (escape === null) {
      return out;
    }
    out += escape.text;
    at += escape.length;
  }
  return out;
}

/**
 * Reads the shopper-facing sentence out of a tool call's arguments while they
 * are still arriving.
 *
 * DECISION: this reads a *string*, never an object, and its output goes to the
 * display stream and nowhere else. The tool call itself is still assembled
 * from the vendor's completed `arguments` payload, parsed once, in full — a
 * half-arrived JSON object is not a decision here any more than it was before,
 * because nothing downstream of this class can act. What it buys is the only
 * thing streaming was ever for: on this harness the sentence the shopper reads
 * is a tool argument, so without this the screen stays blank until the whole
 * call has landed.
 */
export class SpokenArguments {
  private raw = "";
  private shown = 0;

  /** The characters this fragment newly revealed, or `""` while none are. */
  push(fragment: string): string {
    this.raw += fragment;
    const opened = OPENING.exec(this.raw);
    if (opened === null) {
      return "";
    }
    const value = decode(this.raw.slice(opened.index + opened[0].length));
    if (value.length <= this.shown) {
      return "";
    }
    const fresh = value.slice(this.shown);
    this.shown = value.length;
    return fresh;
  }
}
