// Counts that read like a person wrote them. "1 things are costing you sales"
// is both broken English and a tell that a number was pasted into a sentence.
// Where the verb changes too, the caller writes both sentences out — agreement
// is not something a helper can fake for you.

/** "1 listing", "3 listings". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toString()} ${n === 1 ? one : many}`;
}

/** The same, opening a sentence, where a numeral reads like a receipt. */
export function opening(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? `One ${one}` : `${n.toString()} ${many}`;
}
