# Vision-native window control and honest research — design

Date: 2026-09-03. Branch: `master` (post b552eb3). Companion to
`2026-09-02-llm-native-turn-engine-design.md`; §1 there still binds.

## 0. What the founder saw, and the one cause

1. Cards for page chrome: "Hello, Sign In" at ₹0.00 on primeabgb, "Cart 0 item(s) - ₹0.00" ×3 on
   theitdepot, the site logo as the product picture. The model itself said it would buy none of them; the
   cards went up anyway.
2. The errand is blind between moves. It reads refs, presses, and does not know which step of the checkout
   it is standing on; `web_glance` is a fallback it rarely reaches for.
3. Scrolling inside the live view scrolls the transcript under it and the cast is torn down ("the subscriber
   went away" in the log); the strip says "Working in the sandbox window" during a research errand that
   never opens one; told "Amazon", the errand verified primeabgb and moglix; asked the ceiling twice.
4. The errand "never did anything" on the Amazon pick: `web_pick.close handed: payment, carted: false,
   filled: 0`. `handOver()` in `web-handover.ts` runs on every read and a DOM classifier (`paymentPageIn`)
   decided that a product page with a Buy Now button *is* the payment step, so the window was handed over
   before a single move. `signInPageIn` and `botCheck` stop the errand the same way.
5. The live view painted the previous shop (moglix) while the address bar said amazon.in and the chip said
   "in a container"; clicks landed on what the picture showed and were refused six times as
   `relay_target_unreadable`; the click echo flashed the real page and the stream painted the stale one back.
   The cast restarted every second (`browser.frames.served seconds: 1, fast: 1, slow: 1`, "the subscriber
   went away").

The cause is the same in each: the host *guesses* (a `document.title` and the biggest money string are
"the product"; a ref list is "the page"), and the model is then told the guess is the truth. The rebuild
moved planning to the model; perception of the web stayed deterministic. This design moves perception too.

## 1. Principle (unchanged)

The model perceives and decides. The host does exactly three kinds of deterministic work: integrity checks
(a price the model names must be on the page; a URL must be on the shop the shopper named; a ref resolves to
what the host read), custody (refs and pins minted here; credentials typed here; the shutter and redaction on
every picture), and money (unchanged, F2 seam). Nothing here adds a word list, a classifier over the
shopper's words, or a fixed sentence.

## 2. Research: the model names the listing (part D)

`packages/browser-drive` `BatchRead` gains what the reader already has and throws away:

```ts
readonly text: string;              // body innerText, whitespace-collapsed, ≤ 8000 chars
readonly prices: readonly { text: string; around: string }[]; // ≤ 8 whole-money strings by prominence, ±60 chars of context
```
`dom.title`, `dom.heading`, declared listings (schema.org JSON-LD / microdata / OpenGraph product) and
tiles stay as they are: the standards-declared ones are data the page asserts, not a guess.

`web_verify` stops carding. It returns, per URL: `title`, `heading`, `declared` (the schema.org product if
any: name, price, image), `prices`, `sold_out`, `text` (excerpt), `failure`. Nothing gets a ref here.

New move `web_card`:
```ts
{ rows: [{ url, title, price_text, image_url? }] }   // 1..6
```
The host cards a row iff: `url` is one this batch verified (never a URL the model typed); `price_text`
occurs verbatim in that page's `text` or `prices`, and parses to paise > 0; `title` occurs verbatim in
`text`, or equals `title`/`heading`/a declared name; `image_url` is `https:` and was in the page's declared
or tile images (else the card gets the woven mark). Each refused row comes back with the reason in the
tool result; the model may card again. Refs are minted by `WebFindings` as today.

`WebFindings.record` refuses `price_paise <= 0` unconditionally (integrity floor; a ₹0 card is fiction).

Research prompt (`web-errand.ts`): after `web_verify`, read what each page printed and call `web_card` once
with the pages that show one real product with one printed price; a sign-in wall, a basket widget, a category
or search page, a page whose price is a cart total, is not a listing and is skipped; say in one line what was
skipped and why when it matters to the shopper.

## 3. Research obeys the named shop (part H)

`look_on_web` gains `shop?: string` (≤ 60 chars): the shop the shopper named, as they said it ("Amazon",
"amazon.in", "the brand's own site" → empty). The model decides whether a shop was named. The host resolves
the declaration to hosts (`amazon` → `amazon.in` for an INR covenant, plus the bare domain and `www.`;
a literal hostname is taken as given) and pins the errand: `web_verify` and `web_card` refuse URLs whose host
is not on the pin, with the refusal saying so ("the shopper named amazon.in; this page is moglix.com").
The same `WebPin` shape the pick already uses; the pin is the model's own declaration, enforced.

Planner prompt v11 (one sentence): a rough figure is a figure. "₹50,000+" or "around 60k" is the ceiling;
never ask for an exact amount once any amount has been given.

## 4. Research runs in the container (part E)

`HeadlessReader` takes a `ReaderBrowser` port (`open(): Promise<Browser>`, `close()`). In-process mode keeps
today's `launch({ headless: true })`. Container mode opens one container per batch through `ContainerLauncher`
(same image, same lockdown flags, `--headless`, a throwaway profile, `--blink-settings=imagesEnabled=false`),
reads the batch, and ends the container. `resolvePlan` is called once at boot and its surface is shared by
the reader and the window; the boot log names the surface for both. With `COVENANT_BROWSER_SANDBOX=container`
no Chrome process runs on the host for any purpose.

## 5. Vision-native window control (part F)

Every window move returns a picture. `web_open`, `web_read`, `web_press`, `web_write`, `web_add_to_cart`,
`web_fill_address`, `web_sign_in`, `web_enter_code`, and a new `web_scroll { dy }` (−2000..2000, viewport
pixels) each return their text outcome as today plus `image`: the window's redacted screenshot with the 100px
grid, taken after the page settles (one settle beat, ≤ 500 ms), through the same `session.screenshot()` the
card paints from. So:

- shutter: a protected field holding focus means no picture and the outcome says `picture: "withheld: a
  protected field has focus"`; the credential never enters an image;
- redaction: fields the classifier blanks are blank for the model too;
- user-drive: every window tool is already refused, so no picture leaves while the wheel is theirs.

`web_glance` stays as "look again without moving". `web_read` stays as the text complement (refs are names
for controls the picture shows; typing goes through refs and the classifier as today). `web_press` at
coordinates is judged as today (the element under the point is what the guard checks; pay controls are
refused). Frames are never written to the beat log (pinned by `beat-rehydrate.test.ts`).

Errand prompts (BUY, RESUME, summary): "After every move you see the window. Decide the next move from the
picture in front of you, not from memory of an earlier one: where the checkout stands, which control to
press, whether the page moved. Coordinates come off the grid; refs from web_read name the same controls.
When what you need is below the fold, web_scroll. Say nothing between moves."

Budget: one PNG per move at the window's size; an errand is bounded by its move cap (unchanged) and its
clock, so the cost is bounded by the same two numbers. No downscaling in this design; revisit if the
per-errand token count in `purchase.web_pick.close` exceeds what the provider bills comfortably.

## 6a. Handover is the model's call (part J)

`handOver()` no longer stops the errand on a read. `paymentPageIn`, `signInPageIn` and `challengeIn` become
*observations* in the read's outcome (`looks_like: ["payment", "sign-in", "human-check"]`, with the controls
that made the host think so) and nothing more. The model, seeing the page (part F), decides: sign in through
`web_sign_in` (the vault types; unchanged), stop at payment and say so, or call the new move
`web_handover { reason: "payment" | "sign-in" | "human-check" | "other", why }` which raises the handoff
exactly as the host did automatically. What does not move: the click guard still refuses any control the
classifier calls a pay control, the shutter still closes on protected fields, and the shopper can take the
wheel at any time. Landing on a product page is never, by itself, the payment step.

## 6b. The live view shows the page the session is on (part I)

Acceptance, verified against the real container image: after any navigation of the sandbox page, the next
frame served on *both* paths (`/browser/frames` cast and `/browser/frame` poll) is of the new URL; no frame
captured before the navigation is served after it (the sink stamps frames with the navigation sequence and
drops older ones); the EventSource stream survives a cross-origin navigation and the user's own clicks (the
per-second "subscriber went away" restart loop is found and fixed, with the log line that proves it); the
click echo and the stream never disagree. This is a debugging task first (`systematic-debugging`): reproduce
with a scripted navigation moglix → amazon in the container, capture the served frames, then fix the cause
rather than the symptom. Candidate causes to check, in order: the sink re-serving a pre-navigation frame on the
poll path; the cast's coalesced reattach racing the navigation; the EventSource dying on frame size.

## 6. The live view (part G)

- `LiveViewport`: the wheel is handled by a native listener registered with `{ passive: false }` while the
  user holds the wheel, and it calls `preventDefault()`, so the transcript does not scroll under the card and
  the card does not leave the screen mid-drive. React's synthetic `onWheel` cannot do this (passive by
  default), which is the whole bug.
- The cast is torn down only when the session closes or the card unmounts, never because the card scrolled
  out of view; if a visibility rule exists it pauses painting, not the subscription.
- `WindowStrip` copy follows the sandbox view's `state`: `agent-drive` → "Working in the sandbox window";
  `user-drive` → "The window is yours"; `idle` → "A sandbox window is open for this chat"; `closed` → the
  strip hides and "Open the Windows tab" goes with it. A research errand with no window shows the step pills
  and no strip.

## 7. Files (indicative)

| Part | Touches |
|---|---|
| D | `packages/browser-drive/src/chrome/headless-reader.ts` (BatchRead), `apps/agent-host/src/browser/web-verify.ts` (reads only), new `apps/agent-host/src/browser/web-card.ts`, `web-listing.ts` (price floor), `purchase/web-tools.ts` + `web-tool-runner.ts` (`web_card`), `purchase/web-errand.ts` (prompt) |
| H | `packages/agents/src/buyer/turn-plan-tools.ts` (`shop`), `turn-plan.ts` (`TurnPlan.shop`), `turn-plan-prompt.ts` (v11 sentence), `apps/agent-host/src/purchase/web-look-step.ts` (pin from `plan.shop`), `web-pin.ts` (host resolution), `web-verify.ts`/`web-card.ts` (refusals) |
| E | `headless-reader.ts` (port), new `packages/browser-drive/src/container/container-reader.ts`, `apps/agent-host/src/composition-root.ts` + `browser/sandbox-plan.ts` (shared plan) |
| F | `purchase/web-tools.ts` (`web_scroll`), `web-tool-runner.ts` (picture after every move), `browser/web-glance.ts` (shared capture helper), `browser/web-shopper.ts` (`scroll`), `purchase/web-buy-errand.ts` + `web-buy-resume.ts` (prompts) |
| G | `apps/audit-ui/src/browser/LiveViewport.tsx`, `liveBrowser.ts`/`useBrowserSession.ts` (teardown rule), `conversation/WindowStrip.tsx` |
| I | `packages/browser-drive/src/chrome/puppeteer-caster.ts`, `apps/agent-host/src/browser/frame-feed.ts` / `frame-sink.ts` / `frame-pacing.ts`, `apps/audit-ui/src/browser/browserFrames.ts` (whichever the debugging names) |
| J | `apps/agent-host/src/browser/web-handover.ts` (observations, not stops), `web-challenge.ts`, `purchase/web-tools.ts` + `web-tool-runner.ts` (`web_handover`), errand prompts |

## 8. Tests

- D: reader returns `text`/`prices`; `web_verify` cards nothing; `web_card` cards a verbatim row, refuses a
  price not on the page, a ₹0 price, a URL not in the batch; the founder's two pages as fixtures
  (sign-in wall titled "Hello, Sign In"; a page whose only big money string is a cart total) yield no card.
- H: `look_on_web { shop: "Amazon" }` pins to amazon.in for INR; a moglix URL is refused in verify and in
  card with the naming sentence; no shop → no pin; a rough figure does not re-ask (prompt test).
- E: container mode opens the batch through `ContainerLauncher` (real image, like `container-session.test.ts`);
  in-process mode unchanged; boot log names the surface.
- F: every listed move's outcome carries `image` when a frame is available; none does when the shutter is
  closed, and the outcome says so; `web_scroll` moves the page and returns a picture; frames never reach the
  beat log.
- G: wheel over the viewport while holding the wheel relays and does not scroll the document; the strip's
  four states; the cast survives the card leaving the viewport.

## 9. Non-goals

A non-Chromium engine (the drive layer is CDP end to end); downscaled or cropped pictures; a second
"vision judge"; any change to the money tools or the covenant.

- I: a scripted moglix → amazon navigation in the real container serves only post-navigation frames on both
  paths; the stream stays up across it and across relayed clicks.
- J: a product page with a Buy Now button does not hand over; `web_handover` raises the same handoff the host
  used to; the click guard still refuses the pay control.

## 10. Order

I + J first (the founder cannot test anything while the window lies and the errand hands over on sight),
then D + H (honest cards, the named shop), then F (vision), then G (live view), then E (container research).
Each pair merges to `master` after the same review loop as today and restarts agent-host, so the founder can
test each step live.
