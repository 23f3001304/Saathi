# Chat UX research: conversational commerce patterns, and our punch list

Researched 2026-09-02 against Rufus, Shopify Sidekick, Perplexity Shopping, ChatGPT
Shopping, Klarna, Ask Instacart, Google AI Mode, NN/g chatbot research, Google
conversation design, and agentic-UX pattern work (Devin, Claude Code, Perplexity steps).
Grounded in: ChatSession.tsx, Composer.tsx, OptionSet.tsx, OptionRow.tsx,
ActivityStream.tsx, Greeting.tsx, Openers.tsx, StreamText.tsx, BrowserSessionCard.tsx,
web-summary.ts, turn-plan-prompt.ts. Fixed principles respected throughout: hold-to-sign,
unsigned page prices stay unsigned, asks render at the composer, one live option set,
windowless research with step pills, no em dashes.

## 1. Pattern digest

**Amazon Rufus (now Alexa for Shopping)**
- Predicts "latent" questions the shopper would not think to ask and offers them as tappable chips after every answer; the conversation never dead-ends.
- Lives inside the surface the shopper already uses (search bar, product page), not in a separate bot; help arrives at the point of decision.
- Tailors suggestions to the shopper's own purchase history and spend level, and says so.

**Shopify Sidekick**
- Plan, execute, report: it states what it will do, does it, then presents the change for review before applying. Review-before-apply is the trust beat.
- One assistant, reachable from every screen, same thread; no competing entry points.

**Perplexity Shopping**
- Product cards render inside the answer (image, price, merchant, one action); prose and cards are one composition, not two dumps.
- "View more" opens a detail panel with consolidated reviews and sources, so the card stays small and the evidence stays one tap away.
- Buy-here vs click-out is visually distinct on the card itself; the shopper always knows whose checkout they are heading into.

**ChatGPT Shopping**
- Verdict prose first, carousel of cards after; the text answers, the cards let you act.
- Side-by-side comparison is a first-class response shape for 3+ candidates.

**Klarna assistant**
- Keeps conversation and product results visually separated, so the thread stays scannable.
- Their own data: conversational shoppers decided faster with fewer, better-argued options. Fewer options, more reasoning per option.
- Lesson learned in public: pure AI degraded quality; the escalation path to a human is part of the product, not an apology.

**Ask Instacart**
- AI folded into the existing search bar; personalized question prompts seeded from history sit in the empty field before the shopper types.
- Results arrive grouped and annotated with the attributes that drove them (dietary, prep, price), not as a flat list.

**Google AI Mode**
- Fan-out (many queries run silently) but one synthesized answer; the work is summarized, never dumped.
- Agentic checkout only on explicit prior consent, with price tracking offered as the follow-up when the shopper is not ready to buy.

**NN/g chatbot research (Less Chat More Answer; 10 Guidelines; Response Outlining)**
- Users treat chat like a search bar: terse queries, verdict-first answers, 2-3 sentence paragraphs, no pleasantries, no "great question".
- Truncated pyramid: give only the essential answer plus accuracy caveats; everything else goes behind tappable follow-up prompts.
- Every reply should end in chips or affordances; a reply with nothing to tap is a dead end.
- Do not autoscroll to the end of a streaming response; keep the reader at the top of the new message.
- Clarifying questions are friction: ask only when answering wrong would waste more time than asking.

**Google conversation design (chips)**
- Up to 8 chips, 25 characters max, remove chips that no longer apply, cover one example per category of likely answer.

**Agentic UX patterns (Smashing, Devin, Claude Code, Perplexity steps)**
- Intent preview before action; dynamic checklist with the current step highlighted while working; outcome briefing after.
- Live mid-run visibility matters: sessions without it showed roughly 3x abandonment (Augment Code data).
- Action audit with undo, and an explicit escalation pathway, are the post-action safety net. We already have the audit ledger and the handoff; most competitors do not.

## 2. Ranked punch list (by impact in a 5-minute judged demo)

1. **[ChatSession.tsx + Composer.tsx] Refinement chips after the option set lands.** When `optionsLive`, add 3-4 chips under the dock: "Cheaper", "Faster delivery", "More like B", "None of these". Today `replies` only exist for questions and change-choice; after cards land, the only way forward is typing. Evidence: Rufus follow-up chips, NN/g dead-end rule, Google chip guidance. Demo impact: HIGH. One tap, the agent visibly re-runs, the loop is the whole pitch.

2. **[ActivityStream.tsx] Name the work in the header.** Replace the bare "Working…" label with the goal and a live count: "Looking on Amazon for 1TB SSDs · step 4". The goal string can come from the errand that spawned the entry. Evidence: Devin's dynamic checklist, mid-run visibility vs abandonment. Demo impact: HIGH. Windowless research must stay legible on video without the judge expanding anything.

3. **[ActivityStream.tsx] Outcome line on done.** "Done · 12 steps" says effort, not result. Say the briefing: "Read 14 listings across 2 shops, kept 3." Counts already exist in the activity record and listings capture. Evidence: Smashing "return briefing", Perplexity steps summary. Demo impact: HIGH.

4. **[turn-plan-prompt.ts + ChatSession.tsx] An escape chip on every clarifying question.** Add "You decide" to `question.replies` so the agent's judgment is always one tap away, and keep chips to 3-5 per Google guidance. Evidence: NN/g clarifying-question friction; the agent using its own expertise is a demo moment. Demo impact: HIGH.

5. **[ChatSession.tsx + web-summary.ts] Recovery chips on a thin or empty errand.** When zero or one listing is captured, the dock should offer the next move: "Raise the ceiling", "Try another shop", "Ask me differently". Today an empty find ends in a sentence with nothing to press. Evidence: fallback-with-options pattern; an error with no next action is a dead end. Demo impact: HIGH. Demos wobble; visible recovery reads as maturity.

6. **[OptionRow.tsx] Price relative to the signed ceiling.** Next to `Money`, print the delta: "₹640 under your cap". No competitor can print this line because no competitor has a signed cap; it turns the mandate from plumbing into UI. Evidence: cards lead with price everywhere (Perplexity, ChatGPT); transparency-builds-trust research. Demo impact: HIGH.

7. **[OptionSet.tsx] Compare view at 3+ options.** A "Compare" toggle that renders the same options as a small table over the 3-4 axes the agent actually judged (price, delivery, rating, honours-quotes). Cards stay the default; the table is one tap. Evidence: ChatGPT side-by-side, Google AI Mode comparisons. Demo impact: MED-HIGH.

8. **[ChatSession.tsx] Name the sort key in the offer line.** "3 fit, in my order" does not say what the order is. Say it: "3 fit, cheapest first that meets your spec. Nobody paid to be here." Evidence: process-based explanation studies (procedural justice, 2026 MDPI): disclosing the reasoning raises trust and continuance. Demo impact: MED-HIGH, one string.

9. **[BrowserSessionCard.tsx] Current act on the driver chip.** While `agent-drive`, append the latest action label: "Saathi is driving · adding to cart". The action list already holds the string; the chip is where the eye rests. Evidence: live progress panels; Sidekick's narrated execution. Demo impact: MED.

10. **[ChatSession.tsx] Scroll to the top of the newest agent entry, not the end.** The `endRef.scrollIntoView(block: "end")` effect pins the reader to the tail of a growing reply, so a long verdict scrolls its own first sentence off screen. Anchor new agent entries at their start; keep end-pinning only for short lines. Evidence: NN/g guideline 7. Demo impact: MED.

11. **[BrowserSessionCard.tsx] Break up the take-the-wheel paragraph.** The `outsideNote` is a 5-sentence wall. Keep the two load-bearing sentences visible ("Anything you buy here is bought here, not through Saathi. No signed rule applies and it will not appear in your ledger.") and fold the rest behind "What changes while you drive". Evidence: NN/g scannability and progressive disclosure. Demo impact: MED.

12. **[Greeting.tsx] Let assistive tech hear the greeting, and make one line concrete.** The whole greeting is `aria-hidden`, including "What can I help you find?". Un-hide the text lines. Optionally sharpen capability per NN/g guideline 3: "I search shops, compare prices, and build the cart. You sign every purchase." Demo impact: MED (accessibility reads well with judges).

13. **[Composer.tsx] Give the blocked dock a pulse.** "Nothing is answering: nothing can be bought" is honest fail-closed copy, but it offers no path. Add a "Check again" action or an auto-retry note ("checking again in 10s"). Evidence: every error needs a next action. Demo impact: LOW-MED.

14. **[Composer.tsx + question shape] Placeholder that names the expected answer.** Under a question, "Answer here…" could echo the ask: "Size, e.g. UK 9". Needs a hint field on the question payload. Evidence: NN/g reduce-typing-burden. Demo impact: LOW-MED.

15. **[Openers.tsx] One opener that exercises the open-web errand.** All three defaults resolve on-platform. Add "Find a 1TB SSD under ₹5,000 on Amazon" so the sandbox card and step pills appear in the first minute of any cold demo. Demo impact: LOW-MED for users, HIGH for the video specifically.

16. **[ChatSession.tsx] Retire the vestigial confirm stage.** `choose()` now sets `confirmed` and opens the bill in one tap, yet the "Shall I build the cart?" bubble and the Confirm button still render if `stage === "confirm"` is ever reached. Verify unreachable and delete, or collapse fully; the code comment already documents why the three-ask chain was killed. Demo impact: LOW (risk removal).

## 3. Anti-patterns we currently exhibit

- **Dead-end replies.** After cards land, after a summary, after an empty find: no chips. NN/g is blunt that every reply should carry the next tap. Items 1, 4, 5 fix this. (ChatSession.tsx `replies` logic.)
- **Autoscroll to the tail of streaming text.** Verdict-first prose plus end-pinned scroll means the verdict is the first thing pushed out of view. (ChatSession.tsx scroll effect; item 10.)
- **Effort reported instead of outcome.** "Done · 12 steps" and "Working…" describe the machine, not the errand. (ActivityStream.tsx; items 2, 3.)
- **Unexplained ordering.** "In my order" asserts trust without disclosing the key, and the disclosure is exactly what the trust research says converts. (ChatSession.tsx offer line; item 8.)
- **Wall-of-text safety copy.** The take-the-wheel note buries its two critical sentences in five. (BrowserSessionCard.tsx; item 11.)
- **Meaningful text hidden from screen readers.** The entire greeting, including the actual first question, is `aria-hidden`. (Greeting.tsx; item 12.)
- **Fail-closed with no pulse.** Blocked state names the problem and offers nothing. (Composer.tsx; item 13.)

## 4. Three things NOT to do

1. **No one-tap in-chat checkout (the Buy with Pro move).** Prefilled payment and instant buy is the pattern everyone else is racing toward, and it deletes the single deliberate gesture our whole architecture exists to protect. The hold-to-sign is the product; never optimize it away, and never let a card's tap start a payment.
2. **No sponsored slots, badges, or "recommended" ribbons on the option set.** ChatGPT is turning its carousel into paid shelf space. Our OptionSet invariant (no promote/badge prop exists) plus "Nobody paid to be here" is a differentiator judges can verify in the code. Adding a highlight prop for demo sparkle would forfeit it.
3. **No personality padding or proactive upsell.** No greetings mid-thread, no "great question", no "you might also like" nudges from an agent that holds a spending mandate. NN/g: users want a search bar that answers; a mandate-holder that cross-sells reads as the manipulation we were built to refuse. The turn-plan's terseness rules are correct; do not soften them.

## Sources

- NN/g: Less Chat, More Answer; 10 Guidelines for Site AI Chatbots; Explainable AI (nngroup.com)
- Smashing Magazine: Designing for Agentic AI, practical UX patterns (2026)
- Google conversation design: Suggestions/chips guidance (developers.google.com)
- Amazon: Rufus announcements and personalization notes (aboutamazon.com); alby Rufus UX review
- Perplexity: Shop like a Pro (perplexity.ai/hub/blog)
- Shopify: Sidekick help docs and product page (shopify.com)
- Instacart: Ask Instacart launch post (instacart.com/company/updates)
- Klarna: OpenAI case study and press notes on assistant, hybrid-support reversal
- Google AI Mode shopping: TechCrunch (2025-05-20), ppc.land on ads in AI Mode
- Trust research: MDPI JTAER 2026 procedural-justice study of recommendation explanations; ScienceDirect on transparency in recommendation agents

## 5. Our own screens, audited (2026-09-02, live walkthrough of the deployed build)

Ranked; (F) = fixed in the same pass.

### Integrity-adjacent
1. **(F) The bill can show a different amount than the cart the signature releases.** BillCard renders the picked card's client-side price; the signed cart is the cart beat's. In the scripted flagship the sheet said Rs 1,299 while the built cart and the Orders row said Rs 1,199. What you see must be what you sign: the bill now binds to the cart beat when present.
2. **(F) Raw transaction and order ids in a shopper bubble.** "Your bill is ready to pay. (txn_43918671... order_TWufS...)". Ids belong to the Ledger, not the conversation.
3. **Contradiction: cards carry "no signed quote" chips directly under prose saying "I have a signed quote".** The chip reflects listing-time state and reads as a lie either way. Chip should update once a quote is signed, or say "quote pending".
4. **"Cart built" pill live while the dock still asks "Pick one".** The scripted run builds its default cart before the pick; ask and act on screen at once.

### Looks-broken
5. **(F) Orders rows titled with raw URNs** (urn:covenant:merchant:kolam-run) and raw fold words (link_issued). Now: merchant short name, "Awaiting payment", rounded rupees.
6. **Key thumbprint jargon repeats on shopper surfaces.** "ES256 · user-2026-09-bfd65ad0" appears twice on one bill sheet and again in the signed pill. Once, behind a tap, would say more.
7. **Trailing ".00" on nearly every price.** Rs 1,299.00 in cards, bills, orders. Round rupees unless paise are real.
8. **The payment moment opens with an apology.** "No payment link was issued for this bill, so there is nothing to scan." Lead with the action; mention the missing QR only if a QR was promised.
9. **Pay now is a black button in an indigo-and-saffron system**, with no amount on it. "Pay Rs 1,299" in house indigo.
10. **SKU codes printed on option-card art** (ST-KURTA-NAVY-M) and merchant disambiguators in titles ("(Acme)").

### Flow and hierarchy
11. **The refusal moment renders as plain grey prose.** "That call was refused before it ran" is the product's thesis and visually indistinguishable from small talk. It deserves the marked treatment the verdict card gets.
12. **One mode toggle per work block.** Three "Just The Latest | The Steps | Everything" rows on one screen; the mode is global, render its control once.
13. **Duplicate new-chat affordances** in one bar (title dropdown left, "+ New chat" right).
14. **The sign gate's bubble restates itself.** "A navy kurta under Rs 2,000, refundable: at most 2000.00 INR, apparel, refundable only" is one fact said twice with a machine unit.
15. **"6 refused" top-bar chip has no noun.** Judges see a scary number; "6 attacks refused" is the brag.
16. **Sign-in and key screens bury their one action.** Ghost-faint hold square reads disabled; "Continue as a demo user" is a hairline button for the only path forward.
17. **Opener cards: tag chips restate the title, captions are near-invisible, card bottoms ragged.**
18. **Sort pill leaks the machine token**: "Sorted by verified price, lowest first. (price_asc)".
