// When has the shopper finished speaking?
//
// The recogniser answers that with silence: stop making noise for long enough
// and it calls the utterance final. That is a microphone's answer, not a
// listener's — "I want running shoes and" is final by silence and obviously
// unfinished to anyone actually listening, and hands-free voice mode would
// send it and start answering over the top of the rest of the sentence.
//
// So a small model reads the transcript and says whether the thought is
// finished. Verified live against `POST https://api.sarvam.ai/v1/chat/
// completions` with `api-subscription-key`: 420–600 ms, and correct on all six
// probes ("I want running shoes and" → MORE, "size L" → DONE, "umm" → MORE).
// `sarvam-105b` itself is a reasoning model — it emits `reasoning_content` and
// leaves `content` null until it has finished thinking, which is useless at
// this latency — so the conversational variant is the one asked.

export interface TurnEndDetector {
  /** True when the shopper appears to have finished their thought. */
  complete(transcript: string): Promise<boolean>;
}

const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";

const MODEL = "sarvam-105b-conversations";

/** Past this the decision is not worth waiting for: answer from the heuristic
 *  and let the shopper carry on rather than sitting on their sentence. */
const BUDGET_MS = 900;

const SYSTEM = [
  "You judge whether a shopper speaking to a shopping assistant has finished",
  "their sentence. Reply with exactly one word, DONE or MORE, and nothing else.",
  "",
  "Examples:",
  '"a navy kurta under 2000 rupees" -> DONE',
  '"I want running shoes and" -> MORE',
  '"show me" -> MORE',
  '"size L, refundable please" -> DONE',
  '"umm" -> MORE',
  '"what shoes do you have" -> DONE',
].join("\n");

/** Words that leave a sentence hanging, so silence after one is a pause. */
const DANGLING = new Set([
  "and",
  "or",
  "but",
  "so",
  "then",
  "with",
  "for",
  "from",
  "under",
  "over",
  "about",
  "like",
  "maybe",
  "also",
  "plus",
  "the",
  "a",
  "an",
  "my",
  "some",
  "umm",
  "um",
  "uh",
  "er",
  "hmm",
]);

function lastWord(text: string): string {
  const words = text
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
  return words[words.length - 1] ?? "";
}

/**
 * The floor, and the answer whenever the model cannot be reached in time. It
 * only claims the obvious: a sentence ending on a conjunction or a filler is
 * not finished. Everything else is treated as complete, because holding a
 * finished sentence is a worse failure than sending an unfinished one.
 */
export function heuristicTurnEnd(): TurnEndDetector {
  return {
    complete: async (transcript: string): Promise<boolean> => {
      const said = transcript.trim();
      if (said === "") return false;
      return !DANGLING.has(lastWord(said));
    },
  };
}

function answerOf(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  return typeof content === "string" ? content.trim().toUpperCase() : null;
}

function verdictOf(raw: unknown): boolean | null {
  const word = answerOf(raw);
  if (word === null) return null;
  if (word.startsWith("DONE")) return true;
  return word.startsWith("MORE") ? false : null;
}

async function ask(
  apiKey: string,
  transcript: string,
  signal: AbortSignal,
): Promise<boolean | null> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "api-subscription-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 4,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `"${transcript}" ->` },
      ],
    }),
  });
  if (!res.ok) return null;
  return verdictOf(await res.json());
}

/**
 * The model, with the heuristic underneath it. A slow answer is no answer: the
 * request is abandoned at the budget and the floor decides, so a bad network
 * costs the shopper nothing but the model's judgement.
 */
export function modelTurnEnd(
  apiKey: string,
  floor: TurnEndDetector = heuristicTurnEnd(),
): TurnEndDetector {
  return {
    complete: async (transcript: string): Promise<boolean> => {
      const said = transcript.trim();
      if (said === "") return false;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), BUDGET_MS);
      try {
        const verdict = await ask(apiKey, said, abort.signal);
        if (verdict !== null) return verdict;
      } catch {
        // A refused, dropped or abandoned call is not a reason to hold a
        // finished sentence; the floor answers instead.
      } finally {
        clearTimeout(timer);
      }
      return floor.complete(said);
    },
  };
}

export function createTurnEndDetector(): TurnEndDetector {
  const key = import.meta.env.VITE_SARVAM_API_KEY as string | undefined;
  const trimmed = key?.trim() ?? "";
  return trimmed === "" ? heuristicTurnEnd() : modelTurnEnd(trimmed);
}
