import type { BrowserSessionView } from "./browserSession.ts";

/**
 * The open-web beat, as the chat sees it. Mirrors what
 * `packages/browser-drive` actually journals — the refusal sentences here are
 * the harness's own words, not UI copy invented to sound reassuring.
 *
 * DECISION: every line names itself as a sample, and the total is stated
 * without a confidence. The card carries a banner saying the whole panel is
 * canned, but a line reading "Read the total: ₹1,299 (high confidence)" is
 * indistinguishable from a real reading once it is quoted, screenshotted or
 * read aloud — and the reel is plausible enough to demo without it.
 */

const MERCHANT = "kolamrun.example";
const BASE = `https://${MERCHANT}`;

export const BROWSING: BrowserSessionView = {
  merchant: MERCHANT,
  url: `${BASE}/cart`,
  title: "Your bag — Kolam Run (sample)",
  state: "agent-drive",
  actions: [
    { id: "a1", label: "Sample — opened the shop", outcome: "ok" },
    { id: "a2", label: "Sample — searched for “navy kurta”", outcome: "ok" },
    { id: "a3", label: "Sample — added it to the bag", outcome: "ok" },
    {
      id: "a4",
      label: "Sample — a bag total of ₹1,299 stands in here",
      outcome: "ok",
    },
  ],
};

export const HANDOFF_LOGIN: BrowserSessionView = {
  ...BROWSING,
  url: `${BASE}/account/signin`,
  title: "Sign in — Kolam Run (sample)",
  state: "user-drive",
  handoff: {
    reason: "login",
    ask: "This shop wants a password. I never type credentials — the window below is yours. Sign in and I will pick up where I left off.",
  },
  actions: [
    ...BROWSING.actions,
    {
      id: "a5",
      label: "Sample — tried to type the password",
      outcome: "refused",
      reason:
        "That is a password field. The agent never types a credential — you type it in the window you can see.",
    },
  ],
};

export const READY_TO_RESUME: BrowserSessionView = {
  ...HANDOFF_LOGIN,
  url: `${BASE}/account`,
  title: "Your account — Kolam Run (sample)",
  handoff: {
    reason: "login",
    ask: "This shop wants a password. I never type credentials — the window below is yours.",
    readiness:
      "It looks like you are through. I stay paused until you tell me to carry on.",
  },
};

export const REFUSED_OVER_CAP: BrowserSessionView = {
  merchant: MERCHANT,
  url: `${BASE}/checkout`,
  title: "Checkout — Kolam Run (sample)",
  state: "agent-drive",
  actions: [
    ...READY_TO_RESUME.actions,
    { id: "a6", label: "Sample — you signed in; I carried on", outcome: "ok" },
    {
      id: "a7",
      label: "Sample — tried to type the card number",
      outcome: "refused",
      reason:
        "The page declares that field as card data. The agent never touches card data.",
    },
    {
      id: "a8",
      label: "Sample — tried to press “Place order”",
      outcome: "refused",
      reason:
        "That button commits the payment. Pressing it is the user's act, never the agent's.",
    },
    {
      id: "a9",
      label: "Sample — stopped assisting; the bag is over your cap",
      outcome: "refused",
      reason:
        "The cart reads ₹4,299 against a ₹2,000 cap. On a page like this I cannot hold a limit, so I stop here and do not open the payment step. The window is yours; nothing has been paid.",
    },
  ],
};

/** The reel, in order, with how long each beat holds. */
export const BROWSER_REEL: ReadonlyArray<{
  readonly at: number;
  readonly view: BrowserSessionView;
}> = [
  { at: 0, view: BROWSING },
  { at: 2600, view: HANDOFF_LOGIN },
  { at: 6200, view: READY_TO_RESUME },
];

export const AFTER_RESUME = REFUSED_OVER_CAP;
