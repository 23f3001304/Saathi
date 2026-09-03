# Vision-Native Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live view never lies about the page; the errand sees the window after every move and decides handover, listings and the shop itself; no Chrome runs on the host.

**Architecture:** Perception moves to the model (pictures after every move, page reads instead of guessed listings, observations instead of automatic stops); the host keeps integrity (verbatim-on-page, host-minted refs, the shopper's named shop as a pin), custody (shutter, redaction, credentials) and money. Frames are stamped with the navigation they belong to so a stale one can never be served.

**Tech Stack:** pnpm monorepo, TypeScript strict, zod 4 (`z.toJSONSchema`), vitest, puppeteer-core over CDP, Hono, React 18 + Vite (audit-ui), Docker (browser sandbox image `covenant-browser-sandbox:latest`, `chrome-headless-shell` 152).

**Spec:** `docs/superpowers/specs/2026-09-03-vision-native-window-design.md` (§0 symptoms, §1 principle, §2 D, §3 H, §4 E, §5 F, §6a J, §6b I, §6 G, §8 tests, §10 order).

## Global Constraints

- ESLint hard limits: `max-lines 200` per `.ts` file, `max-lines-per-function 40` (test callbacks included), `complexity 8`, no `any`. Measure line counts after prettier formatting too (`pnpm exec prettier <file> | wc -l`); the repo is CRLF so `prettier --check` fails on line endings alone and is not the gate.
- dependency-cruiser: inward-only, `no-circular`, `no-unresolvable`; `packages/agents` imports only `domain`/`memory`/`mandates`; `apps/agent-host` resolves `@covenant/agents` and `@covenant/browser-drive` through `dist`, so run `pnpm exec tsc -b` before agent-host tests after editing a package.
- Comments say why, never what; `DECISION:` paragraphs for choices. No em dash character in any prompt or shopper-facing string (a hyphen with spaces is what the prompts use). Nothing fixed: no word lists over the shopper's words, no canned sentences the model did not write.
- Security seams that do not move: `FieldClassifier` refusals on pay controls and protected fields; the shutter (no screenshot while a protected field has focus under agent-drive); frames never written to the beat log (`beat-rehydrate.test.ts`); `CredentialVault` typing; `FORBIDDEN_CONTAINER_ARGS` / `REQUIRED_CONTAINER_ARGS`; refs and pins minted by the host.
- Commits: path-scoped (`git add <files> && git commit -m "<one evocative sentence>" -- <files>`), never `git add -A`, never anything under `apps/landing` or `docs/superpowers`; trailer after a blank line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch: `master` (the founder tests from this checkout; agent-host is restarted after each merged pair).
- Gate per task: `pnpm exec tsc -b`; `pnpm exec vitest run <touched packages/apps>`; `pnpm exec eslint <touched src and tests> --max-warnings 0`; `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs`; `pnpm --filter @covenant/audit-ui build` when audit-ui is touched. Container tests launch the real image and share one container name, so never run two container suites at once.

---

## File map

| Area | File | Responsibility |
|---|---|---|
| I | `packages/browser-drive/src/chrome/puppeteer-caster.ts` | screencast binding; must follow the page's current target and drop frames from the target it left |
| I | `packages/browser-drive/src/session/browser-session.ts` | `navigations(): number` counter the frame path stamps with |
| I | `apps/agent-host/src/browser/frame-feed.ts`, `frame-sink.ts`, `frame-pacing.ts` | one feed per subscriber; drops any frame whose navigation stamp is older than the page's |
| I | `apps/audit-ui/src/browser/browserFrames.ts` | the EventSource stream; must not die per second on healthy input |
| J | `apps/agent-host/src/browser/web-handover.ts` | observations only (`looks_like`), no automatic stop |
| J | `apps/agent-host/src/browser/web-challenge.ts` | human-check as an observation, not a stop |
| J | `apps/agent-host/src/browser/web-handover-move.ts` (new) | `web_handover` verb: raise the handoff the model asked for |
| J | `packages/agents/src/buyer/money-tool-registry.ts`, `apps/agent-host/src/purchase/web-buy-tools.ts`, `web-tool-runner.ts`, `web-buy-errand.ts` | the move, its declaration, its prompt |
| D | `packages/browser-drive/src/chrome/headless-reader.ts` (+ new `price-probe.ts`) | `BatchRead.text`, `BatchRead.prices` |
| D | `apps/agent-host/src/browser/web-verify.ts` | reads only, no cards |
| D | `apps/agent-host/src/browser/web-card.ts` (new) | `web_card`: verbatim checks, cards, refusals |
| D | `apps/agent-host/src/browser/web-listing.ts`, `purchase/web-errand.ts`, `web-buy-tools.ts`, `web-tool-runner.ts` | price floor, prompt, declaration, dispatch |
| H | `packages/agents/src/buyer/turn-plan.ts`, `turn-plan-tools.ts`, `turn-plan-prompt.ts` | `TurnPlan.shop`, `look_on_web.shop`, v11 sentence |
| H | `apps/agent-host/src/purchase/web-pin.ts`, `web-look-step.ts`, `browser/web-verify.ts`, `web-card.ts` | shop pin from the plan; refusals by name |
| F | `apps/agent-host/src/browser/web-picture.ts` (new) | one capture helper: settle, screenshot, grid, data URL, or the withheld note |
| F | `apps/agent-host/src/browser/web-shopper.ts`, `purchase/web-tool-runner.ts`, `web-buy-tools.ts`, `web-buy-errand.ts`, `web-buy-resume.ts` | `scroll`, picture after every move, `web_scroll`, prompts |
| G | `apps/audit-ui/src/browser/LiveViewport.tsx`, `liveBrowser.ts`, `useBrowserSession.ts`, `conversation/WindowStrip.tsx` | non-passive wheel, teardown rule, strip copy by state |
| E | `packages/browser-drive/src/chrome/headless-reader.ts`, new `packages/browser-drive/src/container/container-reader.ts`, `apps/agent-host/src/composition-root.ts`, `browser/sandbox-plan.ts` | reader browser port; container batches |

---

### Task 1 (part I): The live view only serves frames of the page the session is on

**Files:**
- Modify: `packages/browser-drive/src/chrome/puppeteer-caster.ts`
- Modify: `packages/browser-drive/src/session/browser-session.ts` (add `navigations()`)
- Modify: `apps/agent-host/src/browser/frame-sink.ts`, `frame-feed.ts` (stamp + drop), `browser-look.ts` if the poll path needs the stamp
- Modify: `apps/audit-ui/src/browser/browserFrames.ts` only if the reproduction shows the client kills a healthy stream
- Create: `packages/browser-drive/tests/caster-navigation.test.ts`, `apps/agent-host/tests/frame-navigation.test.ts`, and a container reproduction `packages/browser-drive/tests/container-cast-navigation.test.ts`
- Test doubles: `packages/browser-drive/tests/fake-caster.ts` (exists), `tests/container-rig.ts` (exists)

**Interfaces:**
- Consumes: `PuppeteerCaster.start(settings, onFrame)`, `CastFrame { bytes, mediaType, ack, width, height }`, `Feed`/`emit`/`offer` in `frame-sink.ts`, `BrowserSession.screencast()`/`screenshot()`, `GET /browser/frames` (SSE) and `GET /browser/frame` in `http/window-routes.ts`.
- Produces: `CastFrame.navigation: number` (the `navigations()` count at capture time); `BrowserSession.navigations(): number` (increments on every main-frame committed navigation); `Capture.frame.navigation: number` from `screenshot()`; the feed drops any capture whose `navigation` is below the session's current count, counting it in `FeedCounts.stale`.

This task is a debugging task first (superpowers:systematic-debugging): reproduce, find the cause, then fix the cause. The symptom in the founder's log: after the sandbox navigated moglix → amazon, the card kept painting moglix; `browser.frames.served` showed `seconds: 1, fast: 1, slow: 1` in a loop with "the subscriber went away".

- [ ] **Step 1: Reproduce in the real container.** Write `packages/browser-drive/tests/container-cast-navigation.test.ts` using `buildContainerSession()` from `tests/container-rig.ts`: launch, `goto` the baked fixture shop page A (`file:///opt/covenant/fixtures/shop/index.html`), start the cast with `session.screencast()` collecting frames into an array, wait for two frames, `goto` fixture page B (any second page in `/opt/covenant/fixtures/shop/`; add a trivially distinct one to `packages/browser-drive/fixtures/shop/` if there is only one, with a full-bleed distinct background colour), wait 1.5 s, stop. Decode each collected JPEG/PNG (use `decodePng` for PNG casts or set the cast format to png in the test) and classify by the dominant colour of the top-left 50×50 pixels. Assert: every frame collected after the navigation's `framenavigated` (record the time) is page B. Run it: it is expected to FAIL (frames of A arrive after the navigation) or pass; record which in the report. If it passes in the container, reproduce the client half: `apps/audit-ui/tests/browser-frames.test.ts` already fakes `EventSource`; add a case where the stream delivers frames stamped with `navigation: 1` after a state read reports `navigation: 2` and assert the client discards them (this is the client-side half of the fix regardless of where the stale frame is born).

- [ ] **Step 2: Find the cause.** Instrument, do not guess: in `puppeteer-caster.ts` log (test-only, via the existing logger port if any, else a collected array) each `Page.screencastFrame` with `event.metadata.timestamp` and the CDP session id, and each `framenavigated`; in `frame-feed.ts` log each emit with the capture's stamp. Candidate causes, in the order to check: (a) frames from the old CDP session arriving after `reattach()` detached it (buffered events emitted before `detach` resolves); (b) the coalesced `RESTART_COALESCE_MS` timer firing before the new document commits, so `attach()` binds the old target; (c) the client's EventSource `onerror` firing on a healthy stream (frame size), so `watchFrames` falls to the poll path and the poll path serves a cached frame. Write down which one it was in the report, with the log lines.

- [ ] **Step 3: Write the failing unit tests.**

```ts
// packages/browser-drive/tests/caster-navigation.test.ts
import { describe, expect, it } from "vitest";
import { PuppeteerCaster } from "../src/chrome/puppeteer-caster.js";
import { fakePage } from "./fake-caster.js"; // extend the existing double: emits framenavigated, hands out CDP sessions that can be detached, and records which session a frame came from

describe("the cast follows the page's current target", () => {
  it("drops frames from a session it has detached", async () => {
    const page = fakePage();
    const caster = new PuppeteerCaster(page.page);
    const frames: number[] = [];
    await caster.start({ format: "png", quality: 80, maxWidth: 1280, maxHeight: 900, everyNthFrame: 1 }, (f) => frames.push(f.navigation));
    page.emitFrame(page.sessions[0]);           // navigation 0
    page.navigate();                            // framenavigated, new session created after coalesce
    await page.settle();                        // timers run
    page.emitFrame(page.sessions[0]);           // a straggler from the detached session
    page.emitFrame(page.sessions[1]);
    expect(frames).toEqual([0, 1]);
  });
});
```

```ts
// apps/agent-host/tests/frame-navigation.test.ts
import { describe, expect, it } from "vitest";
import { newFeed, offer } from "../src/browser/frame-sink.js";
import { fakeService, frameStamped } from "./support/frame-fakes.js"; // a service whose session.navigations() is settable

describe("a frame from before the navigation is never served", () => {
  it("drops the stale capture and counts it", () => {
    const service = fakeService({ navigation: 2 });
    const sent: number[] = [];
    const feed = newFeed(service, { ready: () => true, send: (c) => sent.push(c.kind === "frame" ? c.frame.navigation : -1), closed: () => undefined }, service.logger);
    offer(feed, frameStamped(1));
    offer(feed, frameStamped(2));
    expect(sent).toEqual([2]);
    expect(feed.counts.stale).toBe(1);
  });
});
```

- [ ] **Step 4: Run both to see them fail** (`pnpm exec vitest run packages/browser-drive/tests/caster-navigation.test.ts apps/agent-host/tests/frame-navigation.test.ts`). Expected: FAIL on `navigation`/`stale` not existing.

- [ ] **Step 5: Implement.** `BrowserSession.navigations()`: a counter incremented in the page's main-frame `framenavigated` handler (register once at `launch()`). `CastFrame.navigation` and `Capture.frame.navigation`: stamped from that counter at capture time (`PuppeteerCaster.attach` closes over the session it created; a frame arriving on a session that is no longer `this.session` is dropped before `onFrame`, which fixes (a); on `framenavigated` the reattach waits for the new document (`page.waitForNavigation`-free: use `page.mainFrame().isDetached()`/the `domcontentloaded` event of the new document rather than a fixed timer) which fixes (b)). Feed: `FeedCounts.stale`, and `offer()`/`emit()` drop a capture whose `navigation < service.navigations()`. The poll route `/frame` already takes a fresh screenshot; stamp it too. If (c) was the cause, fix `browserFrames.ts` so a healthy stream is not closed (the report names what `onerror` was reacting to) and add the client test from Step 1. Keep every file under 200 lines; split `frame-feed.ts` if the stamp logic pushes it over.

- [ ] **Step 6: Run the unit tests and the container reproduction** until all pass, then the browser-drive and agent-host suites, lint, depcruise, `tsc -b`. Expected: all green; `container-cast-navigation.test.ts` asserts only page-B frames after the navigation.

- [ ] **Step 7: Commit** (path-scoped) with a sentence that names the cause you found.

---

### Task 2 (part J): Handover is the model's move

**Files:**
- Modify: `apps/agent-host/src/browser/web-handover.ts` (observations, not stops), `web-challenge.ts`
- Create: `apps/agent-host/src/browser/web-handover-move.ts`
- Modify: `packages/agents/src/buyer/money-tool-registry.ts` (`WEB_HANDOVER_TOOL = "web_handover"`, added to `WEB_SHOP_TOOLS`)
- Modify: `apps/agent-host/src/purchase/web-buy-tools.ts` (declaration), `web-tool-runner.ts` (dispatch), `web-buy-errand.ts` (BUY and WHY prompts)
- Test: `apps/agent-host/tests/web-handover-move.test.ts` (new), update `apps/agent-host/tests/web-tools.test.ts` / any test asserting the automatic stop (find with `grep -rln "handoff.raised\|AT_PAYMENT\|SIGN_IN\|bot_check" apps/agent-host/tests`)

**Interfaces:**
- Consumes: `handOver(session, dom, onHandover)` in `web-handover.ts`; `botCheck(session, dom)`; `session.handoff().raise(reason, url)`; `WebResult` (`webOk`/`webFailure`); the runner's `statefulCall` switch.
- Produces: `observeWindow(dom): { looks_like: readonly ("payment" | "sign-in" | "human-check")[]; because: readonly string[] }` (pure, no session, no side effect) exported from `web-handover.ts`; every `web_read` outcome body gains `looks_like` and `because`; `WEB_HANDOVER_TOOL` with args `{ reason: "payment" | "sign-in" | "human-check" | "other"; why: string (1..300) }` whose verb `HandoverMove.raise(reason, why)` raises the session handoff, records `progress.handedOver = reason` exactly as the automatic path did, and returns the same `WebResult` copy (`AT_PAYMENT`, `SIGN_IN`, `BOT_CHECK`) the automatic path returned.

- [ ] **Step 1: Write the failing tests.**

```ts
// apps/agent-host/tests/web-handover-move.test.ts
import { describe, expect, it } from "vitest";
import { observeWindow } from "../src/browser/web-handover.js";
import { HandoverMove } from "../src/browser/web-handover-move.js";
import { domWith } from "./support/dom-fakes.js"; // build a PageDom with named controls; reuse whatever helper web-tools.test.ts uses

describe("a read observes, it does not stop", () => {
  it("names a Buy Now page as looking like payment and returns no stop", () => {
    const seen = observeWindow(domWith({ controls: [{ ref: "c1", kind: "button", label: "Buy Now" }] }));
    expect(seen.looks_like).toContain("payment");
    expect(seen.because[0]).toMatch(/Buy Now/);
  });
  it("raises the handoff only when the model asks", async () => {
    const session = fakeSession(); // records handoff().raise calls
    const move = new HandoverMove(() => session, progress);
    const result = await move.raise("payment", "the page is asking for a card number");
    expect(session.raised).toEqual([{ reason: "payment", url: session.url() }]);
    expect(progress.handedOver).toBe("payment");
    expect(result.isError).toBe(false);
  });
});
```
And in the runner test: a `web_read` on a Buy Now page returns `ok: true` with `looks_like: ["payment"]` and does not raise; `web_handover { reason: "other", why }` maps to the session's `"payment"`-shaped stop copy? No: `"other"` raises with reason `"handback"`-equivalent (`HandoffReason` already has the reasons the session knows; map `"sign-in"` → `"login"`, `"human-check"` → `"captcha"`, `"other"` → `"payment"` is wrong; use the session's `"final-review"` for `"other"`. Check `HandoffReason` in `packages/browser-drive/src/handoff/` and use its names verbatim; the test asserts the mapping.)

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement.** `observeWindow(dom)` wraps `paymentPageIn`, `signInPageIn`, `challengeIn` from `@covenant/browser-drive` as observations (`because` carries the sighting's `signal`/`detail`). `handOver()` becomes: `return null` after computing nothing (delete it and its callers, or keep the name for the read's observation; do not leave a dead stop path). `web_read`'s outcome adds `looks_like`/`because`. `HandoverMove` in `web-handover-move.ts` (≤ 80 lines) raises through `session.handoff().raise(...)`, sets `progress.handedOver`, returns the copy the automatic path used (move those constants into the new file). Declaration in `web-buy-tools.ts`: "Hand the window to the shopper. Call it when the page in front of you is the payment step (you never press what pays), asks them to sign in and web_sign_in has nothing stored, or asks them to prove they are human. `why` is one sentence they will read." Runner: `case WEB_HANDOVER_TOOL`. `WEB_SHOP_TOOLS` gains the name (F2 registry: it moves no money; say so in the comment). Prompts (`web-buy-errand.ts` BUY bullet list): replace "if the shop asks you to sign in, call web_sign_in… If nothing is stored… the window is theirs" and "stop at the payment step" with: "Landing on a product page is never the payment step. When you are at the step that takes money, or the shop wants something only they can give, call web_handover with the reason and one sentence why; that is how the window becomes theirs. Until then keep going."

- [ ] **Step 4: Run tests, lint, depcruise, `tsc -b`** (agent-host resolves `@covenant/agents` through `dist`). Expected green; the old automatic-stop tests are rewritten to assert the observation instead.

- [ ] **Step 5: Commit** path-scoped.

---

### Task 3 (part D): The model names the listing

**Files:**
- Modify: `packages/browser-drive/src/chrome/headless-reader.ts` (`BatchRead.text`, `BatchRead.prices`); Create: `packages/browser-drive/src/chrome/price-probe.ts` (move `priceProbe` there and make it return up to 8 candidates with context)
- Modify: `apps/agent-host/src/browser/web-verify.ts` (reads only)
- Create: `apps/agent-host/src/browser/web-card.ts`
- Modify: `apps/agent-host/src/browser/web-listing.ts` (`record` refuses `price_paise <= 0`), `apps/agent-host/src/purchase/web-buy-tools.ts` (`RESEARCH_TOOL_DECLARATIONS` gains `web_card`, `web_verify` description rewritten), `web-tool-runner.ts` (`cardCall`), `web-errand.ts` (prompt), `packages/agents/src/buyer/money-tool-registry.ts` (`WEB_CARD_TOOL = "web_card"`)
- Test: `packages/browser-drive/tests/price-probe.test.ts`, `apps/agent-host/tests/web-card.test.ts`, update `apps/agent-host/tests/web-look.test.ts` and the verify tests

**Interfaces:**
- Consumes: `BatchRead`, `HeadlessReader.readMany`, `WebFindings.record(found: PageListing[])`, `parsePaise`, `RESEARCH_TOOL_DECLARATIONS`, `verifyCall(call, verifyVerbs)`.
- Produces:
  - `BatchRead.text: string` (innerText, `\s+` collapsed, ≤ 8000 chars); `BatchRead.prices: readonly { text: string; around: string }[]` (≤ 8, by prominence, `around` = ±60 chars of the containing element's text).
  - `VerifyVerbs.verify(urls)` returns `webOk({ pages: [{ url, ok, sold_out, title, heading, declared: {name, price_text, image_url} | null, prices, text, failure }] })`; it records nothing in `findings`.
  - `CardVerbs.card(rows: { url; title; price_text; image_url? }[]): WebResult` → `webOk({ carded: [{ ref, url, title, price_text }], refused: [{ url, reason }] })`, reasons: `"url_not_verified"`, `"price_not_on_page"`, `"price_not_positive"`, `"title_not_on_page"`, `"off_shop"` (Task 4 fills the last).
  - `WEB_CARD_TOOL`.

- [ ] **Step 1: Failing tests.**

```ts
// apps/agent-host/tests/web-card.test.ts
it("cards a row whose price and title are on the page, refuses the rest", () => {
  const verbs = new CardVerbs(findings, reads);
  reads.remember([{ url: "https://shop.example/p1", text: "Navy Kurta ... ₹1,299.00 ...", prices: [{ text: "₹1,299.00", around: "Navy Kurta ₹1,299.00 Add to cart" }], title: "Navy Kurta", heading: "Navy Kurta", declared: null, ok: true, sold_out: false, failure: null }]);
  const result = verbs.card([
    { url: "https://shop.example/p1", title: "Navy Kurta", price_text: "₹1,299.00" },
    { url: "https://shop.example/p1", title: "Navy Kurta", price_text: "₹999.00" },      // not on page
    { url: "https://shop.example/p2", title: "Anything", price_text: "₹1.00" },          // not verified
    { url: "https://shop.example/p1", title: "Hello, Sign In", price_text: "₹0.00" },   // the founder's page
  ]);
  expect(result.body.carded).toHaveLength(1);
  expect(result.body.refused.map((r) => r.reason)).toEqual(["price_not_on_page", "url_not_verified", "price_not_positive"]);
  expect(findings.find(result.body.carded[0].ref)?.price_paise).toBe(129900);
});
```
Plus: `verify` records nothing (`findings.length` unchanged, no row has a `ref`); `WebFindings.record` drops a ₹0 listing; `price-probe.test.ts` (browser-drive, jsdom or a puppeteer fixture page like the existing reader tests) returns the two biggest money strings with context and never a struck-through one.

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** per the interfaces; `web-card.ts` ≤ 150 lines: verbatim checks are `text.includes(price_text)` or `prices.some(p => p.text === price_text)`, `parsePaise(price_text) > 0`, title check `text.includes(title) || title === read.title || title === read.heading || title === read.declared?.name`. Reads are remembered per batch in `VerifyVerbs` (a `VerifiedReads` map keyed by URL, exposed to `CardVerbs`). Prompt in `web-errand.ts`: replace the "This host then opens every one at once and reads the title, the printed price… only rows that come back with a ref are on cards" paragraph with: "This host then opens every one at once, headless, and hands you what each page printed: its title, its heading, any product the page declares, the money strings on it with the words around them, and an excerpt. Read them like a person would. Then call web_card once, naming for each real product page its title and its printed price exactly as the page shows them. A sign-in wall, a basket widget, a category or search page, a total that belongs to a cart, is not a listing: leave it out and say in one line what you left out when it matters to them. Only rows web_card returns with a ref are cards; recommend from those and no others."
- [ ] **Step 4: Gate.** `tsc -b` (browser-drive and agents feed agent-host through dist), vitest for `packages/browser-drive apps/agent-host`, lint, depcruise.
- [ ] **Step 5: Commit** path-scoped.

---

### Task 4 (part H): Research obeys the named shop; a rough figure is a figure

**Files:**
- Modify: `packages/agents/src/buyer/turn-plan.ts` (`TurnPlan.shop?: string`), `turn-plan-tools.ts` (`look_on_web` gains `shop: z.string().max(60).optional()` with description "The shop the shopper named, as they said it, or leave it out"), `turn-plan-collector`/record where `query` is copied (mirror for `shop`), `turn-plan-prompt.ts` (id `buyer.turn-plan@v11`; one sentence added to `moveRule()` after the web paragraph: `"A rough figure is a figure: '₹50,000+' or 'around 60k' is the ceiling, and you never ask for an exact amount once any amount has been given.\n"`; docstring line `v11: the web look carries the named shop; a rough figure is a figure.`)
- Modify: `apps/agent-host/src/purchase/web-pin.ts` (`WebPin.forShop(named: string, currency: string): WebPin | null`), `web-look-step.ts` (pin from `plan.shop`), `browser/web-verify.ts` and `web-card.ts` (refuse off-pin URLs: `"off_shop"` with the sentence `the shopper named <host>; this page is <host>`)
- Test: `packages/agents/tests/turn-plan-prompt.test.ts` (v11, the sentence), `turn-plan-draft.test.ts` or the collector test (shop recorded), `apps/agent-host/tests/web-pin.test.ts` (new cases), `web-look.test.ts` (pinned verify refuses moglix by name)

**Interfaces:**
- Consumes: `TurnPlan`, `WebPin.allows(url)`, `VerifyVerbs`, `CardVerbs`.
- Produces: `TurnPlan.shop?: string`; `WebPin.forShop("Amazon", "INR")` → allows `amazon.in`, `www.amazon.in`; `forShop("amazon.in", …)` → the same; `forShop("", …)` → `null` (no pin). Resolution table is data in `web-pin.ts`: `{ amazon: { INR: "amazon.in" }, flipkart: { INR: "flipkart.com" }, myntra: …, croma: …, reliance digital: … }` plus "a literal hostname is taken as given" (a value containing a dot). Unknown name and no dot → `null`, and the verify result says `shop_pin: "none: could not resolve <name> to a host"` so the model knows.

- [ ] **Step 1: Failing tests** (`forShop` table; pinned verify returns `refused: [{url, reason: "off_shop", because: "the shopper named amazon.in; this page is moglix.com"}]` and reads nothing from it; prompt v11 sentence present; collector records `shop`).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Keep `turn-plan-prompt.ts` under 200 lines after prettier (split `moveRule()` into `turn-plan-move-rule.ts` if needed).
- [ ] **Step 4: Gate** (`tsc -b`, vitest for `packages/agents apps/agent-host`, lint, depcruise).
- [ ] **Step 5: Commit** path-scoped.

---

### Task 5 (part F): Vision-native window control

**Files:**
- Create: `apps/agent-host/src/browser/web-picture.ts` (`pictureOf(session): Promise<{ image: string | null; note: string; width; height; redacted }>`: one settle beat ≤ 500 ms via the session's waiter, `session.screenshot()`, `withCoordinateGrid`, data URL; `blackout` → `image: null`, `note: "withheld: a protected field has focus"`)
- Modify: `apps/agent-host/src/browser/web-glance.ts` (use `pictureOf`), `web-shopper.ts` (`scroll(dy)` via `session.page()`/`input().scroll`), `purchase/web-tool-runner.ts` (every window move's outcome gains `image` when present and `picture` note in the body), `web-buy-tools.ts` (`web_scroll { dy: int −2000..2000 }`; descriptions of `web_read`/`web_press`/`web_write` mention the picture), `packages/agents/src/buyer/money-tool-registry.ts` (`WEB_SCROLL_TOOL = "web_scroll"`), `web-buy-errand.ts` + `web-buy-resume.ts` (prompts per spec §5)
- Test: `apps/agent-host/tests/web-picture.test.ts`, `web-tools.test.ts` (every listed move carries `image`; none does under blackout and the note says so), `web-scroll.test.ts`; `beat-rehydrate.test.ts` untouched and still green (frames never in the log)

**Interfaces:**
- Consumes: `session.screenshot(): Promise<Capture>` (`{kind:"frame", frame:{bytes, mediaType, width, height, redacted}} | {kind:"blackout", …}`), `withCoordinateGrid(png)`, `ToolOutcome.image`, `puppeteer-page.ts scrollBy(dy)`.
- Produces: `pictureOf`, `WebShopper.scroll(dy): Promise<WebResult>`, `WEB_SCROLL_TOOL`, outcomes of `web_open|web_read|web_press|web_write|web_add_to_cart|web_fill_address|web_sign_in|web_enter_code|web_scroll|web_glance` shaped `{ ...body, picture: "attached" | "withheld: …" }` with `image` set when attached.

- [ ] **Step 1: Failing tests.**
```ts
it("every window move returns the picture it left the window in", async () => {
  for (const tool of [WEB_READ_TOOL, WEB_PRESS_TOOL, WEB_WRITE_TOOL, WEB_SCROLL_TOOL, WEB_ADD_TO_CART_TOOL, WEB_FILL_ADDRESS_TOOL]) {
    const outcome = await runner.dispatch({ tool, server: WEB_TOOL_SERVER, args: argsFor(tool) });
    expect(outcome.image?.startsWith("data:image/png;base64,")).toBe(true);
    expect(JSON.parse(outcome.content).picture).toBe("attached");
  }
});
it("withholds the picture while a protected field has focus", async () => { session.blackout = true; const o = await runner.dispatch(read); expect(o.image).toBeUndefined(); expect(JSON.parse(o.content).picture).toMatch(/^withheld/); });
```
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** The runner wraps `statefulCall`/`actCall`/`vaultCall` results for the listed tools in one `withPicture(outcome)`; `web_search`, `web_verify`, `web_card`, `web_found`, `web_cart` are not window moves and get no picture. Prompts: BUY's bullet list loses "when the reader's refs fail you… aim web_press at a control's own `at` coordinates" and "when refs and coordinates both fail, call web_glance…" and gains: "After every move you see the window: the picture that follows each result is the page as it stands, with orange grid lines every 100px. Decide the next move from that picture, not from memory of an earlier one: where the checkout stands, what to press, whether the page moved. Coordinates come off the grid; refs from web_read name the same controls and are how you type. When what you need is below the fold, web_scroll. web_glance looks again without moving. Say nothing between moves."
- [ ] **Step 4: Gate** (`tsc -b`, vitest `packages/agents apps/agent-host`, lint, depcruise). Confirm `beat-rehydrate.test.ts` still pins that no frame reaches the log.
- [ ] **Step 5: Commit** path-scoped.

---

### Task 6 (part G): The live view's wheel, teardown and strip

**Files:**
- Modify: `apps/audit-ui/src/browser/LiveViewport.tsx` (native non-passive wheel listener via `useEffect` on the surface ref while `interactive`; `preventDefault()`; relay `{kind:"scroll", dy}`), `useBrowserSession.ts` / `liveBrowser.ts` (the watch is torn down only on unmount or session close; if an `IntersectionObserver`/visibility rule exists it pauses painting only), `conversation/WindowStrip.tsx` (copy by `session.state`: `agent-drive` → "Working in the sandbox window."; `user-drive` → "The window is yours."; `idle` → "A sandbox window is open for this chat."; `closed` → render `null`; research with no window → `null`), `ChatSession.tsx` (pass the sandbox state to the strip)
- Test: `apps/audit-ui/tests/browser-sandbox.test.tsx` (wheel over the interactive surface relays and `preventDefault` was called; over a non-interactive surface it does neither), a new `window-strip.test.tsx` (the four states), `browser-frames.test.ts` (the watch survives a visibility change)

- [ ] **Step 1: Failing tests.** For the wheel: render `LiveViewport` interactive, dispatch a native `WheelEvent("wheel", { deltaY: 120, cancelable: true })` on the surface, assert `relay` was called with `{kind:"scroll", dy:120}` and `event.defaultPrevented === true`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Keep `LiveViewport.tsx` focused: the listener effect is ≤ 20 lines.
- [ ] **Step 4: Gate** (vitest `apps/audit-ui`, eslint `apps/audit-ui/src apps/audit-ui/tests`, `pnpm --filter @covenant/audit-ui build`).
- [ ] **Step 5: Commit** path-scoped.

---

### Task 7 (part E): Research reads in the container

**Files:**
- Modify: `packages/browser-drive/src/chrome/headless-reader.ts` (constructor takes `ReaderBrowser`; default `NativeReaderBrowser` keeps `launch({ headless: true, args })`)
- Create: `packages/browser-drive/src/container/container-reader.ts` (`ContainerReaderBrowser implements ReaderBrowser`: `open()` runs one container through `ContainerLauncher` with a throwaway session id `read_<hex>`, `--headless`, images disabled; `close()` ends it), exported from `src/index.ts`
- Modify: `apps/agent-host/src/browser/sandbox-plan.ts` (`SandboxPlan.readerBrowser: () => ReaderBrowser`), `composition-root.ts` (reader built from the plan; `resolvePlan` called once at boot, result shared), boot log names the surface for the reader
- Test: `packages/browser-drive/tests/container-reader.test.ts` (real image: `readMany([file:///opt/covenant/fixtures/shop/index.html])` returns `dom !== null` and `text` contains a word from the fixture; runs after Task 1's container test, never concurrently), `apps/agent-host/tests/sandbox-plan.test.ts` (in-process plan → native reader; container plan → container reader)

**Interfaces:**
- Consumes: `ContainerLauncher`, `containerRunArgs`, `LaunchedBrowser` (its puppeteer `Browser`), `HeadlessReader.readMany`.
- Produces: `interface ReaderBrowser { open(): Promise<Browser>; close(): Promise<void> }`; `NativeReaderBrowser`; `ContainerReaderBrowser({ image, seccompProfile, memoryMb, ttlSeconds })`; `SandboxPlan.readerBrowser`.

- [ ] **Step 1: Failing tests.** - [ ] **Step 2: Run to see them fail.** - [ ] **Step 3: Implement.** - [ ] **Step 4: Gate** (`tsc -b`, vitest `packages/browser-drive apps/agent-host` with the container suites run alone, lint, depcruise). - [ ] **Step 5: Commit** path-scoped.

---

## Self-review

- Spec coverage: §2 → Task 3; §3 → Task 4; §4 → Task 7; §5 → Task 5; §6a → Task 2; §6b → Task 1; §6 → Task 6; §8 tests are named in each task; §10 order is Tasks 1+2, 3+4, 5, 6, 7.
- Placeholders: Task 1 is a debugging task and names the reproduction, the instrumentation and the three candidate causes rather than a fixed patch; that is the honest shape of it. Task 7's steps are compressed because its interfaces are fully named above.
- Type consistency: `navigation` (Task 1) is the name used on `CastFrame`, `Capture.frame` and `FeedCounts.stale`; `WEB_HANDOVER_TOOL`, `WEB_CARD_TOOL`, `WEB_SCROLL_TOOL` live in `money-tool-registry.ts` (Tasks 2, 3, 5); `VerifiedReads` (Task 3) is what Task 4's pin refusals and Task 3's `CardVerbs` share; `pictureOf` (Task 5) is what `web_glance` and every move use.
