// The assistant's actual dialogue. It asks before it spends, and it narrates
// what it is doing while it works. every activity here corresponds to
// something the real agent does (read the covenant, quarantine listing copy,
// pull price history, demand a signed quote).
import type { OptionRowData } from "./chatScript.ts";
import { HAPPY_OPTIONS } from "./chatScript.ts";

export type Activity = { id: string; text: string; afterMs: number };

export type Turn =
  | { kind: "say"; text: string; afterMs: number }
  | { kind: "ask"; id: string; prompt: string; replies: string[] }
  | { kind: "work"; activities: Activity[] }
  | { kind: "offer"; options: OptionRowData[] };

export const ASSISTANT_SCRIPT: Turn[] = [
  {
    kind: "ask",
    id: "what",
    prompt: "What are you shopping for?",
    replies: ["A navy kurta", "Running shoes", "Something else"],
  },
  { kind: "say", text: "Good. What should I not go past?", afterMs: 420 },
  {
    kind: "ask",
    id: "cap",
    prompt: "Set a ceiling for this purchase.",
    replies: ["₹1,500", "₹2,000", "₹5,000"],
  },
  {
    kind: "say",
    text: "Signed. I will not propose anything above it.",
    afterMs: 380,
  },
  {
    kind: "ask",
    id: "refund",
    prompt: "Does it have to be refundable?",
    replies: ["Yes, refundable only", "Doesn't matter"],
  },
  {
    kind: "work",
    activities: [
      { id: "cov", text: "Read your rules", afterMs: 300 },
      { id: "search", text: "Searching 3 merchants", afterMs: 620 },
      { id: "listings", text: "Read 14 listings", afterMs: 980 },
      {
        id: "quarantine",
        text: "Ignored 4 offers nobody signed",
        afterMs: 1400,
      },
      { id: "history", text: "Checked 30 days of prices", afterMs: 1850 },
      {
        id: "quote",
        text: "Asked Sundar Textiles to sign a quote",
        afterMs: 2300,
      },
      { id: "signed", text: "Quote signed", afterMs: 2750 },
    ],
  },
  { kind: "offer", options: HAPPY_OPTIONS },
];

/** The agent's line while a given activity is in flight. */
export const WORK_NARRATION: Record<string, string> = {
  cov: "Reading what you signed…",
  search: "Looking across the merchants you allowed…",
  listings: "Reading listings. Copy is a claim, not a price.",
  quarantine: "Some listings claim offers nobody signed. I am ignoring those.",
  history: "Checking what these actually sold for.",
  quote: "Asking for a quote I can hold them to…",
  signed: "Signed quote in hand.",
};
