# SDD ledger — plan: (no plan file) founder's three live-test asks, 2026-09-03; briefs task-A/B/C-brief.md in this directory
BASE 800fbc53f033a391faa1b7c62545966f8118fa06 (branch llm-native-turn-engine)
Ruling: three disjoint tasks dispatched in parallel in one checkout with path-scoped commits (`git commit -- <files>`) — why: no shared files (packages/agents vs agent-host+audit-ui vs browser-drive Dockerfile); cost if wrong: a stray file in a commit, fixable by amend before merge.
Task A: implemented 09c8257 (Sonnet), 372/372 agents tests, lint+tsc clean; concern: runaway-line cap test recalibrated 2600->3300; reviewer dispatched (Sonnet).
Task A: complete — review Spec ✅ / Quality Approved (nit: magic-number cap in the runaway-quote test; follow-up, not a defect).
Task B: implemented d889531 (Opus), agent-host 384/384, audit-ui 467/467, lint/depcruise/tsc/build clean; concerns: chat-beat.ts 199 / chat-service.ts 200 lines (split before next beat), platform-card taps also emit picked (accepted), pre-existing: ChatLanes.pick never claims a recorder so a tap on a never-run lane persists nothing (follow-up); reviewer dispatched (Opus).
Task C: implemented 54a3240 (Opus) DONE_WITH_CONCERNS; image 1.32GB->892MB, packages 266->133, trixie-slim + chrome-headless-shell 152.0.7977.75; container tests 41/41 real; screencast+Devanagari verified; concerns: fonts-noto-cjk dropped, libgbm1 drags ~195MB mesa/llvm, no CVE delta (scout needs login), version pinned by hand; reviewer dispatched (Sonnet).
Task C: complete — review Spec ✅ / Quality Approved (nits: fetch-stage apt lists, no upstream checksum available, comment lists 3 of ~15 libs).
Gate on 54a3240: tsc clean, vitest 312 files / 2895 tests passed, eslint clean, depcruise clean (1728 modules), audit-ui build clean. Awaiting Task B review before merge.
Task B: review Spec ✅ / Quality With fixes — F1 required (re-tap after Switch product sets webLaunched early, skips Go to the shop), F2/F4 (derive webLaunched; clear on options), F5 (emit picked only once the ref resolves). Parked: F3 restored platform pick shows Confirm despite cart (out of scope), F6 pre-existing recorder gap on never-run lanes, F7 complexity headroom. Fix round 1 → resumed implementer (Opus).
Task B fix round 1: b412463 — F5 emit moved to WebBuyStep.buy after the listing resolves (+ ChatService after repropose non-null); F1/F2/F4 via a hand override {id,launched} with provenance; 127 files / 854 tests, all gates clean; concerns: chat-service.ts at 200 lines again, platform rule at two call sites. Scoped re-review → resumed reviewer.
Gate on b412463: tsc clean, vitest 312 files / 2898 tests, eslint clean, depcruise clean, audit-ui build clean. Awaiting scoped re-review before merge.
Task B re-review 1: F1/F2/F4/F5 all addressed; NEW F8 regression (picked echo clears the hand → launch ask returns for the whole errand, duplicate run on second press) must fix; F9 chat-service.ts only fits 200 lines unwrapped (prettier → 201) → split; note: no sandbox beat until the run settles, so a remount mid-errand also re-asks (pre-existing, in the founder path) → include as F10 if contained. Fix round 2 → resumed implementer (Opus).
Task B fix round 2: b552eb3 — F8 hand kept when host echoes the same id (+test); F9 chat-pick.ts split, chat-service.ts 182/182; F10 showWindow in window-stage.ts publishes the sandbox beat at open time (+host and client tests); 127 files / 857 tests, gates clean; concerns: two pre-existing tests over 200 after prettier (raw under), picked-beat.test.ts at 200, showWindow only on the open-web leg, prettier --check fails repo-wide on CRLF. Scoped re-review → resumed reviewer.
Gate on b552eb3:  Tests 2901 passed (2901), tsc/eslint/depcruise/build clean. Awaiting re-review 2 before merge.
Task B: complete — re-review 2 All addressed (F8/F9/F10), no new defect. Parked follow-ups: F3 restored platform pick shows Confirm despite cart; F6 ChatLanes.pick never claims a recorder on a never-run lane; web-pick.test.ts/web-address-confirm.test.ts over 200 lines once prettier-formatted (raw under); shared webBuyRig for five suites; open-time sandbox beat only on the open-web leg; repo prettier --check fails on CRLF (core.autocrlf) so line counts are measured via prettier | wc -l.

---
# task-A-brief

# Task A: the planner asks once before a web errand (prompt v10)

Repo: `C:\Users\coehe\Razorpay\covenant`, branch `llm-native-turn-engine`. Package: `packages/agents`.

## Why

The founder watched the live agent take "buy an SSD" straight to `look_on_web` with the query
`buy SSD India online`, no question asked, and pick an external drive when an internal NVMe was wanted.
The planner did exactly what its prompt says: `moveRule()` in `src/buyer/turn-plan-prompt.ts` reads
"a missing budget alone means look first, and narrow it once you have seen the page", the opening says
"When they have named a shop outside this one, going there is the move; a question about it is not", and
the tool descriptions in `src/buyer/turn-plan-tools.ts` say "Naming a shop and a thing is enough to go on".
The founder wants the agent to hold what it needs before it spends a web errand, and to ask for the rest once.
This is a prompt change only. No gate, no regex, no harness rule: the model still decides.

## Files

- Modify: `packages/agents/src/buyer/turn-plan-prompt.ts`
- Modify: `packages/agents/src/buyer/turn-plan-tools.ts`
- Modify: `packages/agents/tests/turn-plan-prompt.test.ts` (and any other test that asserts the old wording; run the package suite to find them)

## Exact changes

1. `TURN_PLAN_PROMPT_ID` becomes `"buyer.turn-plan@v10"`. Add one line to the sealed-version docstring above it:
   `v10: a web look is an errand; the planner holds what/ceiling/must-haves first and asks once for the rest.`

2. In `TURN_PLAN_PROMPT`, replace the sentence
   `When they have named a shop outside this one, going there is the move; a question about it is not.`
   with
   `When they have named a shop outside this one and you hold what to look for there, going is the move; when you do not, one question is.`

3. In `moveRule()`, replace the whole web paragraph, from `A shop outside this one - a marketplace` through
   `narrow it once you have seen the page.\n`, with this text (verbatim, keep the template literal form and the
   `${WEB_LOOK_TOOL}` interpolations; note the house rule: no em dashes anywhere in prompt strings, hyphens
   with spaces are what this file already uses):

   ```
   `A shop outside this one - a marketplace, a brand's own site - is ${WEB_LOOK_TOOL}. ` +
   "A web look is an errand: it opens a window they watch and costs them a wait, " +
   "so it is worth spending only on a thing you could recognise on a page. " +
   "Before you go, hold three things: what exactly (the thing, with the details " +
   "that change which one is right: size, capacity, internal or external, colour, " +
   "model), the most they will spend, and anything it must be (returnable, a " +
   "particular shop, a delivery they need). Take each from what they wrote, from " +
   "the key: value facts about them and from what they said earlier in this " +
   "conversation; what you still cannot fill, ask for once, all of it in one " +
   "question, with the likely answers in replies. When you hold those three, go " +
   `this turn, and the query you hand ${WEB_LOOK_TOOL} is what you would type ` +
   "yourself for exactly their thing: their own product words, the detail that " +
   "narrows it, and the shop if they named one. Never a generic phrase.\n" +
   ```

4. In `turn-plan-tools.ts`, the `answer_shopper` description: replace
   `Do NOT use this to ask something you could find out by looking: if they have named a thing and somewhere to look for it, use ${BROWSE_TOOL} or ${WEB_LOOK_TOOL} and refine after you have seen it. Questions are for what looking cannot answer (a size, a budget they never gave).`
   with
   `Do NOT use this to ask what looking could tell you (a price, whether a shop has it, what it looks like): those are ${BROWSE_TOOL} or ${WEB_LOOK_TOOL}. Questions are for what only they can tell you: which one they mean when the thing comes in kinds, the most they will spend, what it must be. Before a web errand, ask for every one of those you cannot fill, once, in this one question.`
   Keep the rest of that description (blocked_by, one question, replies) as it is.

5. In `turn-plan-tools.ts`, the `look_on_web` description: replace
   `Naming a shop and a thing is enough to go on: look first and refine after you have seen the page. A question you could have answered by looking costs them a turn and tells them nothing.`
   with
   `Go once you hold what exactly to look for, the most they will spend and what it must be; when one of those is missing and nothing they have said fills it, ${ANSWER_TOOL} asks for it first, once. The query is their own words for exactly their thing, plus the shop if they named one; never a generic phrase. A question that looking could have answered costs them a turn; a search without those three costs them a window and a wrong page.`
   (`ANSWER_TOOL` is already imported in that file; check.)

6. Tests, in `tests/turn-plan-prompt.test.ts`:
   - the sealed-version test expects `"buyer.turn-plan@v10"`;
   - add `it("asks once for what it cannot fill before a web errand")`: the closing (`turnPlanClosing("buy ssd")`)
     contains `"ask for once"` and `"Never a generic phrase"`, and does NOT contain `"a missing budget alone means look first"`;
   - add `it("names the three things a web look needs")`: the closing contains `"the most they will spend"` and
     `"anything it must be"`.
   - If any other test in `packages/agents/tests` asserts the replaced sentences, update it to the new wording;
     do not weaken assertions to make them pass.

## Constraints

- ESLint hard limits: `max-lines 200` per file, `max-lines-per-function 40`, `complexity 8`, no `any`. `turn-plan-prompt.ts`
  is near 200 lines. If the new paragraph pushes it over, move `moveRule()` (and only it) into a sibling
  `src/buyer/turn-plan-move-rule.ts` that imports the tool names from `./turn-plan.js`, and import it back. Keep the
  `DECISION:` comments with it.
- Comments say why, never what. No em dashes in any prompt or shopper-facing string.
- Run, from the repo root: `pnpm exec vitest run packages/agents`, then `pnpm exec eslint packages/agents/src packages/agents/tests --max-warnings 0`,
  then `pnpm exec tsc -b` (agent-host resolves `@covenant/agents` through `dist`, so the build must pass).
- Commit only your files, with a path-scoped commit so nobody else's staged work rides along:
  `git add <files> && git commit -m "<one evocative sentence>" -- <files>`. Never `git add -A` or `git add .`.
  Never stage anything under `apps/landing` or `docs/superpowers`. Commit message: one sentence, then a blank line, then
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not spawn subagents. Do not touch files outside `packages/agents`.

## Report

Write `C:\Users\coehe\Razorpay\covenant\.superpowers\sdd\2026-09-03-founder-asks\task-A-report.md`: status
(DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit hash(es), the test/lint/tsc lines, and any concern.
Return only: status, commits, one-line test summary, concerns.

---
# task-A-report

# Task A report: the planner asks once before a web errand (prompt v10)

Status: DONE

Commit: 09c8257855cc59f87efb79eb580fb29398edf86e
"Have the turn planner hold what/ceiling/must-haves and ask once before spending a web errand, in prompt v10."
Scoped to exactly:
- packages/agents/src/buyer/turn-plan-prompt.ts
- packages/agents/src/buyer/turn-plan-tools.ts
- packages/agents/tests/turn-plan-prompt.test.ts

## What changed

1. `TURN_PLAN_PROMPT_ID` bumped to `"buyer.turn-plan@v10"`, with the v10 line added to the sealed-version
   docstring verbatim as specified.
2. `TURN_PLAN_PROMPT` opening sentence about a named outside shop replaced with the "and you hold what to
   look for there ... when you do not, one question is" wording.
3. `moveRule()`'s web paragraph replaced verbatim with the three-things-to-hold paragraph (what exactly,
   the most they will spend, anything it must be; ask once for what's missing; query is the shopper's own
   words, never generic).
4. `turn-plan-tools.ts`: `answer_shopper` description replaced (looking vs. only-they-can-tell-you split,
   "before a web errand, ask for every one of those you cannot fill, once"); `look_on_web` description
   replaced (go once you hold the three things; `ANSWER_TOOL` — already imported — asks first when one is
   missing).
5. `turn-plan-prompt.ts` stayed at 189 lines (limit 200), so no split into a sibling `turn-plan-move-rule.ts`
   was needed.

## Tests

Per the brief: sealed-version test updated to v10; added
`it("asks once for what it cannot fill before a web errand")` and
`it("names the three things a web look needs")` (placed in a new
`describe("what the closing rules say about a web errand")` block, split out to keep the original
`describe("what the closing rules say")` callback under `max-lines-per-function` 40 once the two new tests
were added).

One pre-existing test not named in the brief broke as a side effect of the legitimately longer v10 web
paragraph: `"caps a runaway quoted line rather than growing the prompt with it"` asserted
`turnPlanClosing("x".repeat(2000)).length < 2600`; the new fixed closing text alone pushed that to 3229.
Recalibrated the bound to `3300` — the test still proves the quoted line is capped (slice(0,300)) rather
than scaling with the 2000-char input, only the fixed-overhead constant moved with the intentionally longer
prompt. No assertion was weakened; nothing else in `packages/agents/tests` referenced the replaced wording
(grepped for the old sentences plus `buyer.turn-plan@v9`, only the three touched files matched).

TDD: added/updated tests first, ran them red (3 failing: sealed-id, "ask for once", "the most they will
spend"), then implemented the prompt/tool-description changes, then ran green.

## Verification (from repo root)

- `pnpm exec vitest run packages/agents` — 49 files passed, 372 tests passed, 0 failed.
- `pnpm exec eslint packages/agents/src packages/agents/tests --max-warnings 0` — 0 problems.
- `pnpm exec tsc -b` — clean, no output.

## Concerns

- The `3300` length-cap constant on the "runaway quoted line" test is a judgment call (brief didn't name
  it); picked with headroom above the measured 3229 while keeping the check meaningfully tight rather than
  loosened to a large arbitrary number.
- Did not touch any file outside `packages/agents`; did not stage or commit the unrelated in-progress
  changes visible under `apps/landing` and `docs/superpowers` in this shared checkout.

---
# task-A-review-report

# Task A review report

**Spec compliance: ✅**

- Exact change 1 (prompt id `buyer.turn-plan@v10` + v10 docstring line, verbatim, matching existing ` *  vN:` two-space wrap style): ✅ — `packages/agents/src/buyer/turn-plan-prompt.ts:26-28`.
- Exact change 2 (opening sentence replacement, old sentence gone): ✅ — `turn-plan-prompt.ts:86-88`; old "going there is the move; a question about it is not" confirmed absent (grep).
- Exact change 3 (`moveRule()` web paragraph, verbatim incl. `${WEB_LOOK_TOOL}` interpolations): ✅ — `turn-plan-prompt.ts:135-147`, byte-for-byte match against the brief's block.
- Exact change 4 (`answer_shopper` description, rest of description untouched): ✅ — `packages/agents/src/buyer/turn-plan-tools.ts:62-68`; `blocked_by`/one-question/`replies` text (lines 68-78) unchanged.
- Exact change 5 (`look_on_web` description, `ANSWER_TOOL` already imported): ✅ — `turn-plan-tools.ts:131-137`; `ANSWER_TOOL` import confirmed at `turn-plan-tools.ts:12`.
- Exact change 6 (tests): ✅ — sealed-id test updated to v10 (`tests/turn-plan-prompt.test.ts:231-232`); both new `it`s added verbatim as specified (`:208-217`); grep of `packages/agents/tests` and `packages/agents/src` for the retired phrases ("a missing budget alone", "enough to go on", "refine after", "Naming a shop and a thing") finds only the intentional `.not.toContain` assertion — no other test was left asserting old wording.
- No em dash in any changed prompt/tool-description string: ✅ — diffed only the `+` lines of the commit against U+2014; zero hits. (Pre-existing em dashes at `turn-plan-prompt.ts:17,34,98,107` and `turn-plan-tools.ts:35,40,47` are all inside `/** DECISION */` JSDoc comments untouched by this commit, not prompt/shopper-facing strings, and out of the brief's scope.)
- File size cap: ✅ — `turn-plan-prompt.ts` is 189 lines (under 200), so the brief's fallback (`moveRule()` → sibling file) correctly did not trigger. `turn-plan-tools.ts` is exactly 200 lines, i.e. at, not over, the cap.
- Verification commands, independently re-run: `pnpm exec vitest run packages/agents` → 49 files / 372 tests passed (matches report); `pnpm exec eslint packages/agents/src packages/agents/tests --max-warnings 0` → 0 output/problems (matches report); `pnpm exec tsc -b` → clean, no output (matches report).
- Scope: ✅ — `git diff-tree --no-commit-id --name-only -r 09c8257` lists exactly the three brief-named files; `git status --short -- packages/agents` is clean (no stray uncommitted work in-package); unrelated pre-existing dirty files under `apps/landing`/`apps/agent-host` were correctly left alone.
- Commit: ✅ — `09c8257855cc59f87efb79eb580fb29398edf86e`, path-scoped to the three files, message is one sentence + blank line + `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer, verbatim as required.

**Quality: Approved**

- `packages/agents/tests/turn-plan-prompt.test.ts:189` (`expect(long.length).toBeLessThan(3300)`, recalibrated from 2600) — not wrong, but worth flagging as a maintenance nit rather than a defect. Independently recomputed via the compiled `dist` output: `turnPlanClosing("x".repeat(2000)).length === 3229` (matches the report's figure exactly), and an uncapped quoted line would push that number to roughly 4900+ (a same-shape closing with a short input is 2936 chars; a 2000-char *uncapped* quote would add ~1993 more), so the 3300 bound still fails loudly if the `slice(0, 300)` cap in `turnPlanClosing()` (`turn-plan-prompt.ts:174`) were ever removed — the test's actual intent (bounding the *quoted line's* growth, not the input's) is preserved, and no assertion was weakened. The headroom is tight (71 chars, ~2%), consistent with "meaningfully tight" rather than loosened arbitrarily. The residual nit: this is a second hand-picked magic number that will need re-recalibrating on every future legitimate prompt-length change, which is exactly what just happened. A sturdier version would assert relative to a same-input closing with a short/empty quoted line (e.g. `expect(long.length - turnPlanClosing("x").length).toBeLessThan(400)`), which would stay correct across future fixed-prompt growth without hand-tuning. Not a blocker — the brief explicitly left this number to the implementer's judgment, and the chosen fix is correct and honest about its intent — but worth a follow-up test refactor if this file's fixed overhead moves again.
- Prose self-consistency: the new `moveRule()` web paragraph (hold three things, ask once, then go) is consistent with `TURN_PLAN_PROMPT`'s opening "If you are not sure what they want, ask or look; both are always available to you" (`turn-plan-prompt.ts:73`) — the opening still leaves both ask and look available, and the new paragraph only sequences them (ask first when info is missing, look once it's held) rather than contradicting the opening's "both always available" framing. The three "hold before you go" items are stated identically across all three touched surfaces — `moveRule()` ("what exactly", "the most they will spend", "anything it must be"), `answer_shopper`'s description ("which one they mean when the thing comes in kinds", "the most they will spend", "what it must be"), and `look_on_web`'s description ("what exactly to look for", "the most they will spend", "what it must be") — no drift between the three restatements.
- Grep of both source files for the residual old push-to-search phrasing: "enough to go on" and "refine after" — zero hits in either file (fully removed). "look first" has one remaining hit, `turn-plan-prompt.ts:133`, inside `moveRule()`'s opening line about reads ("A read (see_shelf, see_state) is not a move: look first when the answer depends on what is there..."). This is pre-existing, untouched by the diff, and refers to the internal shop reads (`see_shelf`/`see_state`), not to `look_on_web`/the open web errand — it does not reintroduce the founder's complaint (jumping to a web search before asking) and is out of this task's scope.
- Comments added/kept: the only new prose is the one-line v10 docstring addition, which states why (what changed and the reason, matching the style of every other `vN:` line in that docstring) rather than restating what the code does — consistent with "comments say why, never what."

---
# task-B-brief

# Task B: the pick is app state, not React state

Repo: `C:\Users\coehe\Razorpay\covenant`, branch `llm-native-turn-engine`. Areas: `apps/agent-host` (beats) and
`apps/audit-ui` (snapshot, composer).

## Why

The founder tapped an open-web card, the errand ran, the chat showed "A sandbox window is open for this chat.
Open the Windows tab". He opened the Windows tab and came back. The composer then asked "Pick one below and I
will go and do that in the window" with Cheaper / Better rated / None of these, as if nothing had been picked.

Cause: `pickedId` and `webLaunched` are `useState` in `apps/audit-ui/src/conversation/ChatSession.tsx` (lines
~70-74). Leaving `/` for `/windows` unmounts the Bench, so the pick is gone when the chat remounts, while the
durable `options` beat comes back from the log. Every other fact about a run (options, cart, sandbox, txnId)
is replayed from the host's durable log; the pick is the one that is not. App state is the source of truth
here: the host knows the pick (`purchase.web_pick`, `purchase.pick.web`, `purchase.pick.shop`) and should say
so with a beat, and the client should read it back.

## Design

### agent-host

1. `apps/agent-host/src/http/chat-beat.ts`: add a beat to the `ChatBeat` union:
   ```ts
   /** The card the shopper (or the model, naming it in words) chose. Replayed
    *  from the log so a reload or a route change does not forget the choice. */
   | { readonly offsetMs: number; readonly kind: "picked"; readonly ref: string }
   ```
2. Emit it, before the errand starts, in the two places a pick is made:
   - `apps/agent-host/src/http/chat-service.ts` around line 145 (the `/chat/web-pick` route's path that calls
     `this.webPick.buy(ref, ...)`): `this.hub.emit({ kind: "picked", ref })` (find how the hub is reached in
     that class; use the same hub the other beats use).
   - `apps/agent-host/src/purchase/pick-step.ts` `pickTurn`: emit `{ kind: "picked", ref }` on the web branch
     and on the shop branch (the shop card's id is the sku, see `browseRows` in `src/judge/browse-step.ts`,
     so the same `ref` is what the client's option id is). Not on the unresolved branch.
3. `apps/agent-host/src/http/lane-attention.ts`: a `picked` beat carries no attention (`null`). Check any other
   exhaustive `switch` over beat kinds in agent-host (`grep -rn '"options"' apps/agent-host/src`) and add the case.
4. Tests: in `apps/agent-host/tests`, extend the existing chat-service / pick-step tests (find them with
   `grep -rln "web-pick\|pickTurn" apps/agent-host/tests`) so a web pick and a model pick both emit
   `{ kind: "picked", ref }` before the buy/repropose call. Write the failing test first.

### audit-ui

5. `apps/audit-ui/src/api/agentBeat.ts`: add `| { offsetMs: number; kind: "picked"; ref: string }` to the union and
   `"picked"` to `BEAT_KINDS` (structural admission only, as the file says).
6. `apps/audit-ui/src/conversation/assistantSnapshot.ts`: add `picked: string | null` to `AssistantSnapshot` and
   `picked: null` to `emptySnapshot`. Comment why (one sentence: the choice is the host's fact, replayed like the cart).
7. Fold it: wherever beats become snapshot fields (`beatFold.ts`, `assistantState.ts`, `beatEvents.ts`; follow how the
   `cart` and `options` beats are handled): a `picked` beat sets `picked: ref`; an `options` beat sets `picked: null`
   (a fresh offer supersedes the old choice). Keep the reducers pure and under the lint limits.
8. `apps/audit-ui/src/conversation/ChatSession.tsx`:
   - `pickedId` initialises from `chat.picked`, and an effect adopts `chat.picked` whenever it changes and differs
     from the local value (so a pick the model makes with `pick_option` shows on screen too, and a remount restores it).
     Local `setPickedId(null)` in `changeChoice`/`switchProduct` still works between beats.
   - `webLaunched` initialises to `chat.picked !== null && chat.sandbox !== null` (a restored web pick whose window
     exists has been launched), and the same adopt-on-change effect sets it true when a `picked` restore arrives with a
     sandbox present.
   - Result to verify in a test: a snapshot with `options` (one row with `sourceUrl`), `picked` = that row's id and a
     non-null `sandbox` renders the composer with "Switch product" and never "Cheaper" / "Better rated" / "None of these".
   - `ChatSession.tsx` is a `.tsx` (not lint-capped for length) but keep any new helper small.
9. Tests: audit-ui uses vitest (`apps/audit-ui/src/**/*.test.ts(x)`; find neighbours with
   `grep -rln "options" apps/audit-ui/src --include=*.test.*`). Add: parser admits `picked`; reducer sets/clears
   `picked`; the ChatSession composer case above. Write the failing tests first.
10. Fixture/scripted transports (`scriptTransport.ts`, `assistantScript.ts`) need no change unless a type forces one.

## Constraints

- ESLint hard limits: `max-lines 200` (`.ts`), `max-lines-per-function 40` (tests included), `complexity 8`, no `any`.
  dependency-cruiser: inward-only deps, no cycles. Comments say why, never what (`DECISION:` paragraphs for choices).
  No em dashes in shopper-facing strings.
- Build order: `pnpm exec tsc -b` before running agent-host tests (it resolves `@covenant/agents` through `dist`).
- Run: `pnpm exec vitest run apps/agent-host apps/audit-ui`, `pnpm exec eslint apps/agent-host/src apps/audit-ui/src --max-warnings 0`,
  `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs`, `pnpm exec tsc -b`, and
  `pnpm --filter @covenant/audit-ui build`.
- Commit only your files, path-scoped, so nobody else's staged work rides along:
  `git add <files> && git commit -m "<one evocative sentence>" -- <files>`. Never `git add -A`/`git add .`. Never stage
  anything under `apps/landing` or `docs/superpowers`. Trailer line after a blank line:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not spawn subagents. Two other implementers are working in this checkout at the same time on
  `packages/agents/src/buyer/turn-plan-*.ts` and `packages/browser-drive/Dockerfile`; do not touch those.

## Report

Write `C:\Users\coehe\Razorpay\covenant\.superpowers\sdd\2026-09-03-founder-asks\task-B-report.md`: status
(DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit hash(es), the test/lint/depcruise/tsc/build lines,
files touched, and any concern (for example a beat-kind switch you found that you could not make exhaustive).
Return only: status, commits, one-line test summary, concerns.

---
# task-B-report

# Task B report: the pick is app state, not React state

**Status: DONE**

**Commit:** see below (single path-scoped commit on `llm-native-turn-engine`).

## What changed

The shopper's choice of card is now a beat the host writes to the durable log,
folded into the client's snapshot and read back by `ChatSession`. Leaving `/`
for `/windows` and coming back no longer offers "Pick one below" with Cheaper /
Better rated / None of these over an errand already running in the window.

### agent-host

- `src/http/chat-beat.ts` — new `{ kind: "picked"; ref: string }` member of
  `ChatBeat`.
- `src/http/beat-draft.ts` — the same kind admitted as a `BeatDraft`, so callers
  can emit it.
- `src/http/chat-service.ts` — `picked()` emits `{ kind: "picked", ref }` after
  the predecessor turn has drained and **before** either leg of the errand
  (`runner.repropose`, then `webPick.buy`). Emitting once at the top rather than
  only on the `webPick.buy` line the brief named covers a tapped *platform* card
  too, which loses its pick on a remount for exactly the same reason; the two
  legs are mutually exclusive, so nothing double-emits.
- `src/purchase/pick-step.ts` — `pickTurn` emits on the web branch (before
  `webPick.buy`) and on the shop branch (only once `repropose` returned a cart:
  a ref that rebuilt nothing was never a choice). Nothing on the unresolved
  branch.
- `src/http/lane-attention.ts` — `"picked"` joins `PARKED_KINDS` and falls
  through to `null`. Without this the backward scan walked past the pick to the
  `options` beat underneath and kept badging the lane "owed a pick".

Other `switch`es over beat kinds were checked (`grep -rn '"options"'
apps/agent-host/src`): `beat-store.ts` tests one kind and passes the rest
through, `cli.ts` likewise. No exhaustive switch was left non-exhaustive.

### audit-ui

- `src/api/agentBeat.ts` — the wire union grows the kind and `BEAT_KINDS` grows
  `"picked"` (structural admission only).
- `src/conversation/assistantTransport.ts` — new `{ kind: "picked"; ref }`
  signal.
- `src/conversation/beatSignals.ts` — `choiceSignals` maps the beat to that
  signal. It prints nothing: the offer block already says which card is being
  fetched.
- `src/conversation/assistantSnapshot.ts` — `picked: string | null`, `null` in
  `emptySnapshot`.
- `src/conversation/fieldSignals.ts` — the signal sets the field.
- `src/conversation/assistantState.ts` — `withOffer` clears `picked`: a fresh
  set supersedes the old choice.
- `src/conversation/ChatSession.tsx` — `pickedId` seeds from `chat.picked`;
  `webLaunched` seeds from `chat.picked !== null && chat.sandbox !== null`; one
  effect adopts `chat.picked` on *change* (a `useRef` holds what was adopted, so
  `switchProduct` / `changeChoice` still clear the choice locally between
  beats), and a second sets `webLaunched` once the adopted pick has a window.
  The second effect is keyed on the local `pickedId` matching `chat.picked`,
  so it cannot re-launch a choice the shopper has just switched away from, and
  it does not depend on React batching the `picked` and `sandbox` beats into one
  render.

Fixture/scripted transports needed no change.

## Gates

| gate | result |
| --- | --- |
| `pnpm exec vitest run --project agent-host` | 64 files, **384 passed** |
| `pnpm exec vitest run` (in `apps/audit-ui`) | 63 files, **467 passed** |
| `pnpm exec eslint apps/agent-host/src apps/audit-ui/src --max-warnings 0` | clean |
| `pnpm exec eslint apps/agent-host/tests apps/audit-ui/tests --max-warnings 0` | clean |
| `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs` | no violations (1729 modules, 6187 deps) |
| `pnpm exec tsc -b` | clean |
| `pnpm --filter @covenant/audit-ui build` | built in 295ms |

New tests, written failing first:

- `apps/agent-host/tests/picked-beat.test.ts` — a model pick (web branch, shop
  branch, unresolved) and a tapped card (open-web, platform) each assert the
  beat is in the log *at the moment the errand is handed the ref*.
- `apps/agent-host/tests/lane-attention.test.ts` — a run whose cards were picked
  from is owed nothing.
- `apps/audit-ui/tests/picked-restore.test.tsx` — the parser admits `picked` and
  still refuses an unknown kind; the reducer sets and clears it; a snapshot with
  `options` + `picked` + `sandbox` renders "Switch product" and never Cheaper /
  Better rated / None of these, while a snapshot with `options` alone still
  renders the menu.

## Files touched

```
apps/agent-host/src/http/beat-draft.ts
apps/agent-host/src/http/chat-beat.ts
apps/agent-host/src/http/chat-service.ts
apps/agent-host/src/http/lane-attention.ts
apps/agent-host/src/purchase/pick-step.ts
apps/agent-host/tests/lane-attention.test.ts
apps/agent-host/tests/picked-beat.test.ts            (new)
apps/audit-ui/src/api/agentBeat.ts
apps/audit-ui/src/conversation/ChatSession.tsx
apps/audit-ui/src/conversation/assistantSnapshot.ts
apps/audit-ui/src/conversation/assistantState.ts
apps/audit-ui/src/conversation/assistantTransport.ts
apps/audit-ui/src/conversation/beatSignals.ts
apps/audit-ui/src/conversation/fieldSignals.ts
apps/audit-ui/tests/picked-restore.test.tsx          (new)
```

## Concerns

1. **`chat-beat.ts` is at 199 lines and `chat-service.ts` at exactly 200** — the
   `max-lines 200` cap. To fit the emit, `chat-service.ts` gave up four lines:
   a duplicated doc comment that had drifted onto `carryOn` (it describes
   `pick`) was moved down to `pick` as one line, and `settled()`'s single-
   statement `if` lost its braces, matching the style already used two methods
   above. Both files now need a split before the next beat kind is added.
2. **A pick is not persisted when the lane has never run a sentence.**
   `ChatLanes.pick` does not call `recorder.claim`/`open`, so
   `ConversationBeatStore.chat` is whatever the last `start()` set. This is
   pre-existing and affects every beat a tap-only run emits (sandbox, options,
   cart, outcome), not just `picked`; in the founder's flow the sentence came
   first, so the log has the conversation and the pick replays. Left alone as
   out of scope, flagged here.
3. **The fixture reel does not emit `picked`.**
   `apps/audit-ui/src/conversation/chatScript.ts` still has the old union, so
   fixture mode keeps the previous local-state behaviour. The wire mirror
   (`api/agentBeat.ts`) is the one that had to grow, and it did.

---

# Fix round 1

**Status: DONE**

Addresses F1, F2, F4 and F5 from `task-B-review-report.md`. F3, F6 and F7 left parked as
instructed. Reviewed commit `d889531`; this round is one further commit on top.

## F5 — the beat is written where the ref resolves

The emit used to sit at the top of `ChatService.picked()`, before either leg knew the ref was
good. A tap carries a ref off a card that may be a run old, so a stale tap wrote a `picked` beat
for a card nobody bought — the exact failure `pick-step.ts` writes a comment about avoiding on its
own unresolved branch.

- `apps/agent-host/src/purchase/web-buy-step.ts` — `buy()` emits immediately after
  `findings.find(ref)` returns a listing, and before `sandbox.open` moves the window. This is the
  one place the open-web leg resolves, and **both** entry points reach it (a tap through
  `ChatService`, and the model's words through `pickTurn`), so the two now hold one rule.
- `apps/agent-host/src/purchase/pick-step.ts` — the web-branch emit is gone; a comment says where
  it went and why saying it here too would say it twice. The shop branch keeps its emit, still
  after `repropose` returned a cart.
- `apps/agent-host/src/http/chat-service.ts` — the top-of-method emit is replaced by one after
  `this.runner.repropose(ref)` returns non-null, mirroring the shop branch. An unresolved tap now
  falls through to `webPick.buy` announcing nothing, and `WebBuyStep` decides.

## F1 / F2 / F4 — one value for the choice and its launch

All three came from `pickedId` and `webLaunched` being two mirrors of the host kept in sync by
effects. `apps/audit-ui/src/conversation/ChatSession.tsx` now derives both from one override:

```ts
type HandPick = { readonly id: string | null; readonly launched: boolean };
const [hand, setHand] = useState<HandPick | null>(null);
const pickedId = hand === null ? chat.picked : hand.id;
const webLaunched =
  hand === null ? chat.picked !== null && chat.sandbox !== null : hand.launched;
```

`hand` is what this screen has chosen since the host last spoke, and `null` while the host's own
answer stands. One effect, keyed on a changed-value ref, clears the override when the host says
something new.

- **F1** is fixed because provenance, not value equality, decides. `choose()` sets
  `{ id, launched: false }`, so switching away and tapping the same card again reads as a hand
  pick, not a restore: "Go to the shop" is offered and `pickWebOption` is not called until it is
  pressed. Red-first test: `re-choosing the same card after switching away from it`.
- **F2** is fixed because nothing is mirrored: the host's `picked` is read on the render it
  arrives, so a restored chat no longer paints the pick menu for one frame first. The two inert
  `useState` initialisers are gone with it.
- **F4** is fixed by construction: `webLaunched` is derived from the same `chat.picked` that
  `withOffer` clears, so a fresh offer takes the launch with the pick and the Cheaper / Better
  rated / None of these chips come back. Red-first test:
  `a fresh set of cards after a launched errand`.

## Gates

| gate | result |
| --- | --- |
| `pnpm exec tsc -b` | no output, exit 0 |
| `pnpm exec vitest run apps/agent-host apps/audit-ui` | `Test Files  127 passed (127)` / `Tests  854 passed (854)` |
| `pnpm exec eslint apps/agent-host/src apps/agent-host/tests apps/audit-ui/src apps/audit-ui/tests --max-warnings 0` | no output, exit 0 |
| `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs` | `no dependency violations found (1728 modules, 6184 dependencies cruised)` |
| `pnpm --filter @covenant/audit-ui build` | built in 262ms |

`apps/agent-host/tests/picked-beat.test.ts` was rewritten around the resolve/refuse distinction on
both entry points: the open-web leg says the ref before it drives the window and says nothing for a
ref on no listing it read; the platform leg says it once a cart is rebuilt, from the model's words
and from a tap alike, and a tap whose repropose comes back empty leaves the beat to the leg that
resolves it.

## Files touched

```
apps/agent-host/src/http/chat-service.ts
apps/agent-host/src/purchase/pick-step.ts
apps/agent-host/src/purchase/web-buy-step.ts
apps/agent-host/tests/picked-beat.test.ts
apps/audit-ui/src/conversation/ChatSession.tsx
apps/audit-ui/tests/picked-restore.test.tsx
```

## Concerns

1. `chat-service.ts` is back to exactly 200 lines, the cap, because the platform-leg emit had to
   land inside `picked()`. The guard it rides on is one long line rather than a wrapped one purely
   to fit; there is no `max-len` rule, but the file has no room left and wants splitting.
2. The platform rule now lives at two call sites (`pick-step.ts`'s shop branch and
   `ChatService.picked`) because `pickTurn` reaches `reproposeSku` through a different closure than
   `PurchaseRunner.repropose`. Putting the emit inside `reproposeSku` would make it one place, but
   its resolved path needs the whole cart-building rig to test, so the duplicated one-line rule is
   the tested option. Both sites are the same rule, both after the cart resolves.
3. `hand` is read during render for `pickedId`/`webLaunched`, which is correct here because every
   writer of it (`choose`, `changeChoice`, `goToShop`, `switchProduct`, the adopt effect) is
   followed by a render, but it is a shape worth a second look if the component grows.

---

# Fix round 2

**Status: DONE** — F8, F9 and F10 all done; F10 landed rather than parked.

Addresses F8, F9 and F10 from the "Re-review, fix round 1" section of
`task-B-review-report.md`. Reviewed commit `b412463`; this round is one further commit on top.

## F8 — the host echoing the hand is not news (regression)

`ChatSession.tsx`'s effect dropped the hand whenever `chat.picked` changed, and after F5 the host
names the card at the *start* of the errand. So a second after "Go to the shop" the launch was
thrown away, the cards unfolded and the dock re-asked for a shop it was already standing in — the
founder's symptom moved onto the live path. The clear is now conditional:

```ts
setHand((held) => (held !== null && held.id === chat.picked ? held : null));
```

A host agreeing with the hand changes nothing; a host naming a different card (or clearing it, as a
fresh offer does) still supersedes it. Red-first test:
`the host echoing the launch the hand just made` — click the card, click "Go to the shop", land a
`picked` beat for the same id with no `sandbox` beat, and assert "Switch product" still stands,
"Go to the shop" is gone, and `pickWebOption` was called exactly once.

## F9 — the pick routing has its own module

`apps/agent-host/src/http/chat-pick.ts` (new, 73 lines) holds `carryOnPick`, `pickCard` and the leg
routing that was `ChatService.picked`, over a `PickEngine` the service hands it — the same shape
`chat-cancel.ts` already uses. `ChatService.carryOn` and `pick` are now two lines each over a
private `engine()`, which reads `stated` and `language` at the moment of the tap exactly as the old
code did. Behaviour and tests are unchanged.

`chat-service.ts` is **182 lines raw and 182 after prettier** (was 200 raw / 201 after prettier), so
the formatting trap is gone rather than deferred.

## F10 — the window says it is open when it opens (done, not parked)

`showWindow(hub, shower)` now lives in `apps/agent-host/src/purchase/window-stage.ts`, whose whole
subject is already whether the shopper is being shown the window, and `WebBuyStep.buy` calls it in
one line after `sandbox.open` succeeds and before the errand drives. The settle-time
`ChatService.recordSandbox()` record stays; the later state wins.

It went into `window-stage.ts` rather than `web-buy-step.ts` for a hard reason:
`web-buy-step.ts` had 183 raw / 196 prettier lines, so only four lines of headroom under the cap
once formatted. A `showWindow` method plus its `SandboxView` import plus the interface member
came to 17 raw lines (200 raw / 213 prettier — over). Moving the function out and letting
`SandboxOpener extends WindowShower` piggyback on the existing `window-stage.js` type import costs
`web-buy-step.ts` exactly one line, and trimming the `picked` comment to point at `chat-pick.ts`
paid it back: the file is **183 raw / 196 prettier, its exact baseline**, and `buy()` is back at 40
lines under `max-lines-per-function`.

Tests: `says the window is open before the errand drives it` in `picked-beat.test.ts` drives a real
`WebBuyStep` over the shop harness and asserts the `sandbox` beat is in the log at the moment the
errand starts (captured inside `converse`), naming the product URL. On the client,
`shows the errand under way instead of the cards, mid-errand` asserts options + picked + sandbox
renders "Switch product", folds to "Going for …", and leaves no tappable card.

Four other `WebBuyStep` rigs gained `view: () => …` because `WindowShower.view()` is required, not
optional: an optional member is how the beat would go silently missing again.

## Gates

| gate | result |
| --- | --- |
| `pnpm exec tsc -b` | no output, exit 0 |
| `pnpm exec vitest run apps/agent-host apps/audit-ui` | `Test Files  127 passed (127)` / `Tests  857 passed (857)` |
| `pnpm exec eslint apps/agent-host/src apps/agent-host/tests apps/audit-ui/src apps/audit-ui/tests --max-warnings 0` | no output, exit 0 |
| `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs` | `no dependency violations found (1729 modules, 6191 dependencies cruised)` |
| `pnpm --filter @covenant/audit-ui build` | built in 260ms |

`prettier --check` on the touched files reports every one of them, as it does for every file in the
repo: the worktree is CRLF (`core.autocrlf=true`) and `.prettierrc` is `{}`, so prettier's default
`endOfLine: "lf"` fails on line endings alone. The gate that matters is the formatted line count,
measured per file with `pnpm exec prettier <file> | wc -l`:

| file | raw | after prettier |
| --- | --- | --- |
| `src/http/chat-service.ts` | 182 | 182 |
| `src/http/chat-pick.ts` (new) | 73 | 73 |
| `src/purchase/web-buy-step.ts` | 183 | 196 (baseline 183 / 196) |
| `src/purchase/window-stage.ts` | 59 | 59 |
| `src/wiring/web-wiring.ts` | 73 | 73 |
| `tests/picked-beat.test.ts` | 200 | 200 |
| `tests/web-pick-shut.test.ts` | 127 | 127 |
| `tests/web-resume-record.test.ts` | 110 | 110 |
| `tests/web-pick.test.ts` | 198 | 205 (baseline 197 / 204) |
| `tests/web-address-confirm.test.ts` | 193 | 202 (baseline 192 / 201) |

## Files touched

```
apps/agent-host/src/http/chat-pick.ts                (new)
apps/agent-host/src/http/chat-service.ts
apps/agent-host/src/purchase/web-buy-step.ts
apps/agent-host/src/purchase/window-stage.ts
apps/agent-host/src/wiring/web-wiring.ts
apps/agent-host/tests/picked-beat.test.ts
apps/agent-host/tests/web-address-confirm.test.ts
apps/agent-host/tests/web-pick-shut.test.ts
apps/agent-host/tests/web-pick.test.ts
apps/agent-host/tests/web-resume-record.test.ts
apps/audit-ui/src/conversation/ChatSession.tsx
apps/audit-ui/tests/picked-restore.test.tsx
```

## Concerns

1. `tests/web-pick.test.ts` and `tests/web-address-confirm.test.ts` were already over 200 lines
   once formatted before this round (204 and 201); the one `view: () => …` line each takes them to
   205 and 202. Raw counts are 198 and 193, comfortably under the gate that actually runs, but the
   F9 trap exists in those two files and predates this task.
2. `tests/picked-beat.test.ts` is at 200 raw and 200 formatted — legal, no headroom. The natural
   next move is a shared `webBuyRig` in `tests/support/`, since five suites now build a
   `WebBuyStep` by hand; that is a test-wide refactor, not a fix-round change.
3. `showWindow` publishes the window at open time on the open-web leg only. A platform run that
   opens a window by another route still says nothing until it settles; nothing in the founder's
   path reaches that, but the rule is not yet uniform across the host.

---
# task-B-review-report

# Task B review: the pick is app state, not React state

**Spec compliance: ✅**
**Quality: Approved with fixes** (one required fix, F1; the rest are notes and follow-ups)

Reviewed commit `d889531ca7476e70b0c7f13456f8ae30bba14c2a` on `llm-native-turn-engine`, 15 files,
+372/-11. Nothing under `apps/landing`, `docs/superpowers`, `packages/agents` or
`packages/browser-drive` is in the commit; the uncommitted `apps/landing` work sitting in the
worktree did not ride along, so the path-scoped commit did its job. Trailer present:
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Gates, run from the repo root

| gate | result line |
| --- | --- |
| `pnpm exec tsc -b` | no output, exit 0 |
| `pnpm exec vitest run apps/agent-host apps/audit-ui` | `Test Files  127 passed (127)` / `Tests  851 passed (851)` |
| `pnpm exec eslint apps/agent-host/src apps/agent-host/tests apps/audit-ui/src apps/audit-ui/tests --max-warnings 0` | no output, exit 0 |
| `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs` | `✔ no dependency violations found (1728 modules, 6179 dependencies cruised)` |

(`prettier --check` reports every file in the repo, touched or not, because the worktree is CRLF
and prettier emits LF; there is no format script in `package.json`. Not a finding.)

## Spec compliance, item by item

1. ✅ `chat-beat.ts:130-132` carries the new `picked` member with the brief's own doc comment.
2. ✅ Both entry points emit before the errand.
   - `chat-service.ts:143` emits at the top of `picked()`, after the predecessor turn drains and
     before **both** legs, rather than only on the `webPick.buy` line the brief named. Documented
     deviation, and the right one: it covers a tapped platform card, which lost its pick on a
     remount for the same reason, and the legs are mutually exclusive so nothing double-emits.
     Verified safe against the client fold: `reproposeSku` (`buy-step.ts:70-99`) never calls
     `narrator.present()`, so no `options` beat lands between the emit and the cart and clears the
     field the emit just set.
   - `pick-step.ts:47` (web branch, before `webPick.buy`) and `pick-step.ts:56` (shop branch, after
     `repropose` returned a cart). The shop-branch ordering is a forced deviation from "before the
     errand": you cannot honour "not on the unresolved branch" without first calling `repropose`.
     It is also the safer order, since `repropose` runs before the beat rather than after it.
   - ✅ Never on the unresolved branch of `pickTurn` (`pick-step.ts:59-60`), and the test asserts it.
3. ✅ `lane-attention.ts:16-25`. Note the implementer did more than the brief asked and was right
   to: item 3 as literally written ("a `picked` beat carries no attention (null)") would have been
   a no-op, because `parkedOn` (`lane-attention.ts:35-44`) *skips* kinds not in `PARKED_KINDS` and
   would have walked past `picked` to the `options` beat underneath and kept badging "owed a pick".
   Adding it to the set is what makes the badge clear. `grep -rn '"options"' apps/agent-host/src`
   confirms the report's claim: `beat-store.ts:42` and the rest test one kind and pass the rest
   through; there is no `never`-checked exhaustive switch anywhere in either app.
4. ✅ `tests/picked-beat.test.ts`, `tests/lane-attention.test.ts:43-49`.
5. ✅ `agentBeat.ts:63-66` and `BEAT_KINDS` at `agentBeat.ts:133-134`.
6. ✅ `assistantSnapshot.ts:27-29` and `:52`, with the one-sentence why.
7. ✅ The real file names are `beatSignals.ts` / `fieldSignals.ts` / `assistantState.ts`, not the
   brief's guessed `beatFold.ts` / `beatEvents.ts`; the work landed in the right places.
   `fieldSignals.ts:47-48` sets, `assistantState.ts:73-76` (`withOffer`) clears. Reducers stayed
   pure. Ref matching verified end to end: `webOptionRows` (`web-options.ts:45-46`), `browseRows`
   (`browse-step.ts:31-33`) and `optionRowsOf` (`presentation.ts:73-76`) all set
   `id === sku === ref`, so the beat's `ref` always addresses a client option row.
8. ✅ `ChatSession.tsx:73`, `:78-80`, `:88-93`, `:96-100`. The adopt-on-change-tracked-in-a-ref
   shape is exactly the one this review was told to look for, and it is implemented correctly:
   after `switchProduct()` the local `null` stands, because `adopted.current` still holds the
   host's unchanged `"w1"` and the effect returns early. The switch is not undone. See F1 for the
   one hole left in the *second* effect.
9. ✅ `tests/picked-restore.test.tsx`: parser admits / still refuses, reducer sets / starts null /
   clears on a fresh offer, and the composer case from the brief with its negative control.
10. ✅ `chatScript.ts` untouched; nothing forced it, fixture mode keeps the old local behaviour.

Constraints: `max-lines` holds (`chat-beat.ts` 199, `chat-service.ts` 200, both at the cap);
`max-lines-per-function` holds including `describe`/`it` callbacks (longest is `tapRig` at ~30
lines); `complexity` holds (but see F7); no `any` (the test's `null as unknown as GatewayClient` is
a double assertion, not `any`); no new shopper-facing string at all, so no em-dash exposure;
depcruise inward-only clean.

## Findings

**F1 (required fix) `apps/audit-ui/src/conversation/ChatSession.tsx:96-100`** - the launch effect is
keyed on `chat.picked === pickedId`, which cannot tell "restored from the log" from "re-tapped by
hand". Sequence: the shopper taps "Switch product" (`:216-219`, local `pickedId = null`,
`webLaunched = false`), the cards come back, and they tap the *same* card again. `choose()`
(`:176-184`) sets `pickedId = "w1"` and deliberately sets `webLaunched = false`, because the launch
is meant to be its own gesture; it sends nothing to the host. The effect then fires, sees
`chat.picked === "w1" === pickedId` and a `chat.sandbox` that is still non-null (nothing ever
clears it, `fieldSignals.ts:49-50`), and sets `webLaunched = true`. Why it matters: "Go to the
shop" (`:470-477`) never appears, the offer block folds to "Going for ..." (`:332-340`) so the cards
are no longer tappable, and `pickWebOption` was never called for that re-tap. If the first errand
has already finished, the shopper is in a loop with no way to re-launch. Before this change
`webLaunched` was purely local and the re-tap correctly showed "Go to the shop". Fix: gate the
effect on the pick having come *from the host*, not on value equality - set a
`launchable.current = true` inside the adopt effect at `:89-93` and clear it in `choose()` and
`switchProduct()`, then require it in the launch effect.

**F2 (low) `apps/audit-ui/src/conversation/ChatSession.tsx:73` and `:78-80`** - both `useState`
initialisers are inert. `useAssistant` (`useAssistant.ts:24-31`) starts at `emptySnapshot` and
resets to it inside an effect, so on the first render `chat.picked` and `chat.sandbox` are always
`null` and the restore always runs through the two effects instead. Consequence: after the beats
land, the restored chat repaints twice - pick menu, then "Go to the shop", then "Switch product" -
so there is a brief flash of the very menu this task exists to remove. Harmless in tests (RTL
flushes effects) and roughly one frame in the browser. Fix if it is worth it: derive rather than
store, e.g. `const launched = webLaunchedLocal || (chat.picked === pickedId && chat.sandbox !== null)`,
which removes one effect and the flash with it. The initialisers themselves were mandated by the
brief, so this is not a deviation.

**F3 (low, out of brief scope) `apps/audit-ui/src/conversation/ChatSession.tsx:74` with `:162-168`** -
the restored *platform* pick (no `sourceUrl`). Traced: `pickedId` adopts, `chosen` resolves,
`webChosen` is undefined, `confirmed` is still `useState(false)`, so `stage === "confirm"` and the
composer shows the "Confirm" button plus "Change choice", with "... Shall I build the cart?" in the
transcript (`:384-390`). Sensible as far as it goes, and a clear improvement on the old behaviour
(the pick survives and the refinement chips are gone), but it is half a restore: `chat.cart` is
already in the snapshot, so the host knows the cart was built and the dock still re-asks a question
the shopper answered before they left. Fix, in the same spirit as `picked`: adopt `confirmed` from
`chat.cart !== null` through a changed-value ref, so a restored platform pick with a standing cart
opens on "Review the bill". Do not derive it directly from `chat.cart`, or "Change choice" breaks
the way `switchProduct` would have without the `adopted` ref.

**F4 (low) `apps/audit-ui/src/conversation/ChatSession.tsx:94-100` with `:239`** - `withOffer` now
clears `picked`, but nothing clears `webLaunched`. After a launched web errand re-offers (the
shopper asks for cheaper ones), `optionsLive` stays false, so the Cheaper / Better rated / None of
these chips never come back for the new set. The shape is pre-existing (`webLaunched` was already
sticky across a re-offer) and this change does not worsen it, but it is now one line from fixed:
clear `webLaunched` in the adopt effect when `chat.picked === null`.

**F5 (low, asymmetry) `apps/agent-host/src/http/chat-service.ts:143`** - the emit happens before the
service knows the ref resolves to anything. `WebBuyStep.buy` (`web-buy-step.ts:87-93`) refuses an
unknown ref outright with `web_pick_unknown` and drives nothing, so a tap on a stale ref writes a
`picked` beat for a card that was never bought - which is precisely the failure
`pick-step.ts:53-56` writes a comment about avoiding on its own unresolved branch. Low risk in
practice: the `outcome` beat that follows closes the lane badge, and any fresh `options` beat clears
the client's field. Worth naming because the two entry points now hold different rules for the same
beat. If it is tightened, the honest place is a resolve-then-emit in `picked()`, not the current
top-of-method emit. No test covers this case.

**F6 (note, pre-existing, correctly scoped) `apps/agent-host/src/http/chat-lanes.ts:110-112` with
`beat-store.ts:70-84`** - the implementer's concern 2 checks out and their scoping of it is right.
The store is per lane (`chat-wiring.ts:64-75`), so this is not the process-wide "current chat" bug
and no lane can file into another's transcript; the failure is narrower: a lane whose first action
ever is a tap has `ConversationBeatStore.chat === null`, so `record()` returns early and every beat
that run emits is published live and never written - `sandbox`, `options`, `cart`, `outcome` and now
`picked` alike. This change neither worsens nor improves it, and the founder's own flow (sentence
first) is unaffected. It does leave one live path where the reported symptom can still reproduce:
host restart or lane eviction, client restores the transcript from the log, shopper taps a card,
walks to the Windows tab and back - the `picked` beat was never persisted. Fix when someone takes
it: `ConversationRecorder` needs a "file under this chat" call distinct from `open()` (which also
writes a `buyer` beat), and `ChatLanes.pick` must pass its already-known conversation id through
`ChatService.pick`, which today also never sets `this.conversation`.

**F7 (note) `apps/audit-ui/src/conversation/fieldSignals.ts:40-61`** - `applyFieldSignal` is now at
complexity 8 exactly (one `if` plus six cases), so the next field-setting signal breaks the gate.
Same class of headroom warning as the report's own 199/200-line concern, and worth recording beside
it.

## The two files at the cap

Both trims are safe and in the file's own style.

- `chat-service.ts:125` - the removed comment was a duplicate stacked *above* `carryOn()`'s own doc
  comment while describing `pick`; moving it down to `pick` as one line fixes a drift as well as
  saving three lines, and "a tapped card" is now more accurate than "a tapped open-web card",
  because `pick()` serves both legs.
- `chat-service.ts:159` - de-bracing `if (this.running !== null) await this.running;` is
  behaviour-identical and matches `carryOn()` at `:112` and `recordSandbox()` at `:155`, which
  already use single-statement de-braced `if`s.

## Test quality

Behavioural, not structural, on both sides. `picked-beat.test.ts` captures the hub snapshot from
inside the fake `buy` / `repropose` and asserts `toMatchObject([{ kind: "picked", ref: "w1" }])` on
it, which is an assertion about *order* (exactly one beat, the pick, at the moment the errand is
handed the ref) rather than about a call count - the right shape for "before the errand starts".
`picked-restore.test.tsx` asserts composer copy through `getByRole("button", { name: ... })` and
carries its own negative control ("still opens the menu when nothing has been picked"), so the
absence assertions cannot pass because the tree failed to render. No callback exceeds 40 lines;
note that `hardLimits` in `eslint.config.js:18-20` apply to `**/*.ts` only, so the `.tsx` suite is
uncapped and passes on merit rather than by the gate. The red-first claim is plausible by
construction - every assertion hangs off a line this commit added - but it is not independently
verifiable from a single squashed commit, and I did not reconstruct it (read-only review).

## Beyond the brief

Nothing gold-plated. `beat-draft.ts:19` was forced by the emit's typing; `assistantTransport.ts`,
`beatSignals.ts` and `fieldSignals.ts` are the real file names behind the brief's guessed ones;
`lane-attention.ts` is brief item 3 done properly. The one genuine expansion is the top-of-method
emit in `picked()` covering the platform leg, which the report declares and justifies.

---

# Re-review, fix round 1

Reviewed commit `b41246311c13ec151eb62bbea098c0b807639957` (`d889531..b412463`), 6 files,
+230/-125, path-scoped to `apps/agent-host` + `apps/audit-ui`, trailer present.

**Verdict: All addressed** - F1, F2, F4 and F5 are each genuinely fixed, and the two new client
tests assert the sequences rather than the wiring. **But fix round 1 introduces one regression on
the live launch path (F8 below), which is more visible than any of the four items it fixes and
should block the merge.** F9 is a low-severity trap the round left behind.

## Gates, re-run from the repo root

| gate | result line |
| --- | --- |
| `pnpm exec tsc -b` | no output, exit 0 |
| `pnpm exec vitest run apps/agent-host apps/audit-ui` | `Test Files  127 passed (127)` / `Tests  854 passed (854)` |
| `pnpm exec eslint apps/agent-host/src apps/agent-host/tests apps/audit-ui/src apps/audit-ui/tests --max-warnings 0` | no output, exit 0 |

## Item by item

**F1 - addressed.** Provenance now decides, not value equality. Walked the sequence against the
code: `chatWith([OFFER, PICKED, WINDOW])` leaves `hand === null`, so `pickedId` and `webLaunched`
derive from the host and the dock shows "Switch product". `switchProduct()` (`ChatSession.tsx:206`)
sets `hand = NO_PICK`, so `pickedId` is null and the cards return. The re-tap runs `choose("w1")`
(`:186`), which sets `hand = { id: "w1", launched: false }`; `chat.picked` never changed through any
of it, so the effect at `:105-109` never fires and the hand stands. `webChosen !== undefined &&
!webLaunched` therefore holds, the dock offers "Go to the shop" with the "Go and put it in that
shop's basket?" prompt, and `pickWebOption` is not called. The test
`re-choosing the same card after switching away from it` asserts all three, including
`expect(held.picks).toEqual([])` through a partial mock of `../src/api/agent.ts` - the right
assertion, because "did not send anybody to a shop" is the actual claim.

**F2 - addressed.** Both mirrors are gone; `pickedId` (`:88`) and `webLaunched` (`:94-97`) are
computed during render from `chat`, so the render that carries the restored snapshot already
carries the choice. No effect has to run first, so there is no intermediate commit and no
one-frame flash of the pick menu. The two inert `useState` initialisers went with them.

**F4 - addressed by construction.** `withOffer` clears `chat.picked`, and `webLaunched` is now
derived from that same field, so a fresh offer takes the launch with the pick. The effect at
`:105-109` also drops the hand (null differs from the held "w1"), so a hand cannot outlive the
table it was made at. Test `a fresh set of cards after a launched errand` lands a later `options`
beat through a kept `emit` and asserts the Cheaper chip is back and "Switch product" is gone.

**F5 - addressed, and better than the fix I suggested.** The beat is emitted at the one place the
open-web leg resolves, `web-buy-step.ts:94`, immediately after `findings.find(ref)` returns a
listing and before `sandbox.open` moves the window; the refusal branch above it still says nothing.
Verified that both entry points reach that one instance rather than two copies of the rule:
`buyer-wiring.ts:19` builds a single `WebBuyStep` and hands it to `ChatService`
(`chat-wiring.ts:99`) and to the runner's shared parts (`runner-wiring.ts:123`), which is what
`pickTurn` calls through `WebPickResume`. `pick-step.ts:47-48` correctly drops its own web-branch
emit (a comment says where it went), so nothing double-emits. The platform rule is still duplicated
across `pick-step.ts:57` and `chat-service.ts:147`, both after the cart resolves - the implementer's
concern 2 names it and the reason (testability of `reproposeSku`) is sound. `picked-beat.test.ts`
was rewritten around the resolve/refuse distinction and now drives a real `WebBuyStep` over the
shop harness, asserting the log's contents at the moment the window is handed the URL (`opened[0]`)
and that a ref on no listing produces neither a beat nor a window move.

## New findings

**F8 (regression, must fix) `apps/audit-ui/src/conversation/ChatSession.tsx:105-109`, with
`apps/agent-host/src/purchase/web-buy-step.ts:94` and `apps/agent-host/src/http/chat-service.ts:155`** -
the effect clears the hand whenever `chat.picked` *changes*, including when the host is merely
echoing the choice the hand just made, and after F5 the host echoes it at the *start* of the errand
rather than at its end. Walk the live launch: the shopper taps a card (`hand = {w1, false}`, dock
offers "Go to the shop"), presses it, `goToShop` (`:200`) sets `hand = {w1, true}` and calls
`pickWebOption`, so the dock correctly shows "Switch product". The host then runs
`ChatService.picked`, `repropose` returns null, `WebBuyStep.buy` calls `stage.reveal()`, finds the
listing and emits `picked` *before* `sandbox.open`. That beat streams to the client within the
second, `chat.picked` goes from null to "w1", the effect sets `hand = null`, and `webLaunched` falls
back to `chat.picked !== null && chat.sandbox !== null`. `chat.sandbox` is still null, because the
only `sandbox` beat emitter in the host is `recordSandbox()` at `chat-service.ts:155`, called from
the `finally` of a settled run - and `BrowserService.view()` (`browser-service.ts:136-143`) returns
null for a concealed window, so the preceding research run published no sandbox beat either.
Result: for the whole time the window is being driven, `webLaunched` is false, the offer block
unfolds the cards again (`:341`), and the dock re-asks "Go and put it in that shop's basket?" with
"Go to the shop" over an errand already doing exactly that; a second press queues a duplicate pick
run for the same ref. This is the founder's original symptom moved from the remount path onto the
primary live path, and no test catches it because both new client tests start from a restore where
`chat.picked` is already set, so the clear-on-change branch never runs. Fix, one line: keep a hand
the host is agreeing with -
`setHand((held) => (held !== null && held.id === chat.picked ? held : null));`. Checked against all
four sequences: the restore keeps `hand === null` and is unaffected; F1's re-tap never changes
`chat.picked`, so the effect still does not fire; F4's fresh offer moves `chat.picked` to null,
which differs from the held id, so the hand is still dropped; and the live launch keeps
`{w1, true}` because the host is naming the hand's own card. Add the missing test: click "Go to the
shop", then land a `picked` beat with no `sandbox` beat, and assert "Switch product" still stands
with exactly one entry in `held.picks`.

**F9 (low) `apps/agent-host/src/http/chat-service.ts:145`** - the file passes `max-lines 200` only
because that line is left unwrapped at 91 characters. Running the repo's own configured formatter
(`.prettierrc`) rewraps it into two lines and the file becomes 201 lines, so the next `prettier`
pass over this file breaks the lint gate. Verified by piping `pnpm exec prettier` output to
`wc -l`. There is no `max-len` rule and no format script in CI, so nothing catches it today. Fix:
take the implementer's own concern 1 and split `pick`/`picked` out of the class file rather than
holding the cap with formatting.

**Note (pre-existing, mine to have caught in round 0, not a round-1 regression)** - a remount
*while* the errand is still driving restores `options` + `picked` but no `sandbox` beat, since that
beat is only written when the run settles. `webLaunched` is therefore false and the dock offers the
launch again, exactly as in F8 but without the live trigger. The founder's own flow is unaffected
because his errand had already parked, which is what published the sandbox beat and the "A sandbox
window is open for this chat" strip he saw, and the tests model that settled state. The honest fix
is on the host: emit a `sandbox` beat when the window is revealed and opened, not only in the
`finally` of a settled run. Worth a task of its own; F8's one-liner does not close it.

---

# Re-review, fix round 2

Reviewed commit `b552eb3ffb19a2d6375a9a7265b2ae7aa8e116d5` (`b412463..b552eb3`), 12 files,
+196/-53, path-scoped to `apps/agent-host` + `apps/audit-ui`, trailer present. The only thing left
in the worktree outside those two apps is an untracked `docs/superpowers/`, which did not ride
along.

**Verdict: All addressed** - F8, F9 and F10 are each fixed, each with a test that would have failed
before, and the round introduces no new defect. Two notes below, neither blocking.

## Gates, re-run from the repo root

| gate | result line |
| --- | --- |
| `pnpm exec tsc -b` | no output, exit 0 |
| `pnpm exec vitest run apps/agent-host apps/audit-ui` | `Test Files  127 passed (127)` / `Tests  857 passed (857)` |
| `pnpm exec eslint apps/agent-host/src apps/agent-host/tests apps/audit-ui/src apps/audit-ui/tests --max-warnings 0` | no output, exit 0 |
| `pnpm exec depcruise packages apps tools --config .dependency-cruiser.cjs` | `✔ no dependency violations found (1729 modules, 6191 dependencies cruised)` |

## Item by item

**F8 - addressed.** `ChatSession.tsx:113` is the one-line conditional clear
(`setHand((held) => (held !== null && held.id === chat.picked ? held : null))`), and the four
sequences hold:

- (a) click the card, click "Go to the shop", then a `picked` beat for the same id with no
  `sandbox` beat: `held.id === chat.picked`, so the hand survives with `launched: true`,
  `webLaunched` stays true and the dock keeps "Switch product". The new suite
  `the host echoing the launch the hand just made` drives exactly that through `later([PICKED])`
  and asserts "Switch product" stands, "Go to the shop" is gone, and `held.picks` is `["w1"]` -
  the once-only call I asked for. It is genuinely red-first: under round 1 the unconditional
  `setHand(null)` would drop to `chat.picked !== null && chat.sandbox !== null`, which is false in
  that test because it lands no `WINDOW` beat.
- (b) the host naming a *different* card: `held.id !== chat.picked`, hand cleared, `pickedId`
  falls through to the host's new ref. Not covered by a test of its own; the logic is one
  comparison and the adjacent fresh-offer case (`chat.picked` to null) is covered, so I would not
  hold the round for it.
- The `NO_PICK` corner is safe: after a fresh offer, `held.id` and `chat.picked` are both null so
  the hand is kept, but `{id: null, launched: false}` renders identically to no hand at all, and a
  later `picked` beat still clears it.

**F9 - addressed, and the trap is closed rather than moved.** `chat-pick.ts` (new, 73 lines) holds
`carryOnPick`, `pickCard` and `legFor` over a `PickEngine`, the same seam `chat-cancel.ts` already
uses. Behaviour is preserved on inspection: `carryOn` still returns null when busy or unparked
(the two reads swapped order, both pure); `engine()` reads `stated` and `language` at the moment of
the tap exactly as the old locals did; `queue` is delegated back to the service so `current` and
`running` are still the service's; `finally { engine.settled() }` is the old
`finally { this.recordSandbox() }`. It is also covered by tests this commit did not touch -
`lane-queue.test.ts:86` ("routes a tapped card through the same line") and the unchanged `tapRig`
suites in `picked-beat.test.ts` - which is the evidence that matters for a pure move. Measured
formatted line counts, `pnpm exec prettier <file> | wc -l`: `chat-service.ts` **182** (was 200 raw /
201 formatted), `chat-pick.ts` **73**, `web-buy-step.ts` **196**, `window-stage.ts` **59**. All
under 200 raw and formatted.

**F10 - addressed, and landed rather than parked.** `showWindow` (`window-stage.ts:49-52`) is
called from exactly one place, `web-buy-step.ts:110`: after the `landed.isError` branch, so only
once the open succeeded, and before `progress.reset()` and `this.errand(...)`, so before the errand
drives. `stage.reveal()` at the top of `buy()` is what makes it non-null, since
`BrowserService.view()` returns null for a concealed window. The settle-time record is untouched -
`legFor`'s `finally` still calls `recordSandbox()` - so the later state wins on the client, where
`fieldSignals` simply overwrites the field. Placement in `window-stage.ts` rather than
`web-buy-step.ts` is the right call for the reason given, and the module's subject already was
"whether the shopper is being shown the window". The host-side proof is
`says the window is open before the errand drives it`, which captures the log inside `converse` and
asserts the `sandbox` beat is there naming `PRODUCT`; the client-side test
`shows the errand under way instead of the cards, mid-errand` complements it by asserting the
restored render (Switch product, "Going for ...", no tappable card) but does not itself prove the
timing - the host test is the one that does.

Checked for side effects of the extra beat: `sandbox` is not in `PARKED_KINDS`, so `lane-attention`
is unchanged; `restoredCard` ignores the session's `conversation` field, and
`WindowOwner.claimedBy` is set at open time anyway, so the early beat carries the same payload the
settle beat would; `launching` now falls false as soon as the window is real, which is what it
means. `SandboxOpener extends WindowShower` is required rather than optional, which is why four
rigs gained a `view: () => ...` line - the right choice, an optional member is how the beat would
go missing again.

## Notes (neither blocking, neither new to this round)

**`apps/agent-host/tests/web-pick.test.ts` and `apps/agent-host/tests/web-address-confirm.test.ts`** -
verified the implementer's own disclosure: 198 raw / **205** formatted and 193 raw / **202**
formatted, against baselines of 204 and 201 at `b412463`. Both were already over the cap when
formatted before this task touched them, and the one `view: () => ...` line each moved them one
line further the wrong way in the same round that closed that trap elsewhere. The gate that runs
reads raw lines, so nothing fails today. Worth a cleanup pass, ideally the shared `webBuyRig` the
implementer names in concern 2, which would also give `picked-beat.test.ts` (200 raw / 200
formatted, zero headroom) room to grow.

**`apps/agent-host/src/purchase/web-buy-step.ts:110`** - the open-time announcement is on the
open-web leg only; a resumed checkout (`carryOn` to `webPick.resume`) and any other route that
opens a window still says nothing until the run settles. The implementer names this as concern 3.
It is not reachable from the founder's path (the resumed window was already announced by the errand
that opened it), and the one corner it leaves is an errand that opens a window and then loses it
before settling, where `recordSandbox()` finds nothing to write and the client keeps the last
open-window beat - the shopper still has "Switch product" as the way out, so it is cosmetic.

---
# task-C-brief

# Task C: a lighter browser sandbox image

Repo: `C:\Users\coehe\Razorpay\covenant`, branch `llm-native-turn-engine`. Package: `packages/browser-drive`.
Docker Desktop is running on this machine (`docker version` answers); the current image
`covenant-browser-sandbox:latest` was rebuilt today from the existing Dockerfile.

## Why

Docker Scout flagged about 525 CVEs on the sandbox image. It is `debian:bookworm-slim` plus Debian's full
`chromium` package (`packages/browser-drive/Dockerfile`), which drags in the desktop libraries a headless
sandbox never uses. The founder asked "why Chrome, try a lightweight secure browser". The drive layer is CDP
end to end (`--remote-debugging-pipe`, screencast, DOM refs; see `src/container/*.ts` and
`docker/entrypoint.sh`), so the engine stays Chromium; what changes is the build: a smaller, current binary
with fewer packages behind it.

## Target

- Base: `debian:trixie-slim` (current stable; drop bookworm).
- Browser: **`chrome-headless-shell`** from Chrome for Testing, a pinned current Stable version, downloaded in a
  build stage (`curl` + `unzip`) from `https://storage.googleapis.com/chrome-for-testing-public/<version>/linux64/chrome-headless-shell-linux64.zip`
  (the version list is at https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json;
  pin the version string in the Dockerfile as an `ARG` with a comment saying where to look it up). Install
  only the shared libraries the shell needs at runtime (start from Chrome's documented list: libnss3,
  libnspr4, libatk1.0-0, libatk-bridge2.0-0, libcups2, libdrm2, libdbus-1-3, libxkbcommon0, libxcomposite1,
  libxdamage1, libxfixes3, libxrandr2, libgbm1, libasound2 (or libasound2t64 on trixie), libpango-1.0-0,
  libcairo2, libx11-6, libxcb1, libxext6, libexpat1, libglib2.0-0) and prune anything the binary does not link
  (`ldd` inside the build tells you). Keep `ca-certificates`, `coreutils` (the entrypoint uses `timeout`),
  and the fonts: `fonts-liberation`, `fonts-noto-core` (Devanagari lives here; Hindi shops must render),
  `fonts-noto-cjk` only if the image size cost is small, otherwise drop it and say so.
- Keep the rest of the image contract exactly: non-root `shopper` uid/gid 1001, `/home/shopper/profile/Default`
  and `/home/shopper/downloads`, `COPY fixtures/shop /opt/covenant/fixtures/shop`, the entrypoint, the same
  `ENV` names, `ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]`.
- `docker/entrypoint.sh` executes `/usr/bin/chromium --remote-debugging-pipe "$@"`. Either symlink the shell to
  `/usr/bin/chromium` in the Dockerfile or change the path in the entrypoint; prefer the symlink so nothing
  else has to know.
- The host passes `--headless=new`, `--user-data-dir=...`, `--hide-scrollbars` plus the sandbox args
  (`src/container/run-args.ts` `containerChromeArgs`). `chrome-headless-shell` is the old headless implementation
  packaged alone; verify it accepts `--headless=new` (it may ignore it). If the shell refuses to start with it, change
  `containerChromeArgs` to pass plain `--headless` and adjust the test that asserts the flag; do not add a mode switch.

## Verification (this is the deliverable, not the Dockerfile)

1. `docker compose --profile build-only build browser-sandbox` from the repo root (the compose service tags
   `covenant-browser-sandbox:latest`). Record the image size before (today's rebuild) and after
   (`docker image ls covenant-browser-sandbox`) and the installed package count before/after
   (`docker run --rm --entrypoint sh covenant-browser-sandbox:latest -c 'dpkg -l | grep -c ^ii'`; for the old
   image use the `:dev` tag if it is still there or the size only).
2. Run the container tests: `pnpm exec vitest run packages/browser-drive/tests/container-session.test.ts packages/browser-drive/tests/container-lockdown.test.ts`
   (they launch the real image through `ContainerLauncher`, 90s launch budget; see `tests/container-rig.ts`).
   They must pass. If they are skipped without Docker, make sure they are not skipped here.
3. One real screencast check, since the shopper watches this window: with the image running through the rig
   (or a small script using `ContainerLauncher` directly), open `file:///opt/covenant/fixtures/shop/index.html`
   (the shop baked into the image) and confirm a `Page.captureScreenshot` returns a non-blank PNG and that a
   Devanagari string renders (any fixture page with Hindi, or evaluate a `document.body.innerText` on an injected
   `<p>नमस्ते</p>` and screenshot it). Say in the report how you checked.
4. If Docker Scout is logged in (`docker scout quickview covenant-browser-sandbox:latest`), record the CVE
   summary before/after; if it needs a login, say so and report size and package count instead. Do not log in.

## Constraints

- No change to the lockdown surface: `FORBIDDEN_CONTAINER_ARGS` / `REQUIRED_CONTAINER_ARGS` in
  `src/container/docker-args.ts` stay as they are; the seccomp profile stays.
- ESLint hard limits (`max-lines 200`, `max-lines-per-function 40`, `complexity 8`) if you touch `.ts`. Comments say why.
- `docker-compose.yml` needs no change unless the build context does.
- Commit only your files, path-scoped: `git add <files> && git commit -m "<one evocative sentence>" -- <files>`.
  Never `git add -A`/`git add .`; never stage `apps/landing` or `docs/superpowers`. Trailer after a blank line:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not spawn subagents. Two other implementers are working in this checkout on `packages/agents` and on
  `apps/agent-host` + `apps/audit-ui`; do not touch those. agent-host is running on this machine against the
  `:latest` tag; a rebuild replaces the tag, which is fine.

## Report

Write `C:\Users\coehe\Razorpay\covenant\.superpowers\sdd\2026-09-03-founder-asks\task-C-report.md`: status
(DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit hash(es), the pinned browser version, image size
and package count before/after, the test lines, how the screencast/Devanagari check was done, and concerns
(for example if `fonts-noto-cjk` was dropped or the headless flag changed).
Return only: status, commits, size before/after, one-line test summary, concerns.

---
# task-C-report

# Task C report — a lighter browser sandbox image

**Status: DONE_WITH_CONCERNS**

Commit: **`54a3240`** — "The window the shopper watches is a browser now and not
a desktop, and half the image goes with the difference".
`packages/browser-drive/Dockerfile` only, staged path-scoped. No `.ts`, no
`docker-compose.yml`, no entrypoint change;
`FORBIDDEN_CONTAINER_ARGS` / `REQUIRED_CONTAINER_ARGS` and the seccomp profile
are untouched.

## What changed

`debian:bookworm-slim` + Debian's full `chromium` package → `debian:trixie-slim`
(13.6) + **`chrome-headless-shell` 152.0.7977.75**, the current Chrome for
Testing Stable, downloaded in a `fetch` build stage with `curl` + `unzip` and
pinned as `ARG CHROME_VERSION` with the lookup URL in a comment above it.
`curl`/`unzip` exist only in that stage, so the shipped image carries no
downloader. The shell is symlinked to `/usr/bin/chromium`, so
`docker/entrypoint.sh` is unchanged and nothing else had to learn a new path.

The image contract is intact: non-root `shopper` 1001:1001,
`/home/shopper/profile/Default` and `/home/shopper/downloads`,
`COPY fixtures/shop /opt/covenant/fixtures/shop`, the same three `ENV` names,
`ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]`.

The package list was built from evidence rather than from the documented list:
the bundle ships a `deb.deps` naming full Chrome's Debian dependencies (GTK,
cups, cairo, pango, libcurl, wget, xdg-utils) and `ldd chrome-headless-shell`
links **none** of them, so those are gone. The build re-checks itself — an
`ldd | grep "not found"` gate and `chromium --version` run as a build step, so
an unresolved SONAME fails the image rather than the first session.

One package is in the list that `ldd` cannot tell you about:
**`fontconfig-config`**. Chrome carries fontconfig inside the binary, so nothing
appears in `ldd`, and without `/etc/fonts/fonts.conf` it matches no family at
all — every font installed, every page blank, and the only clue one
`Fontconfig error:` line on Chrome's stderr. Found by reading stderr on the
first smoke run; noted in the Dockerfile so the next slimming pass does not
delete it again.

## Numbers

| | before (bookworm + `chromium`) | after (trixie + headless shell) |
| --- | --- | --- |
| browser | Chromium 151.0.7922.173 | Chrome for Testing 152.0.7977.75 |
| base | Debian 12.15 bookworm | Debian 13.6 trixie |
| `docker image ls` size | **1.32 GB** | **892 MB** (−33%) |
| `docker image inspect .Size` | 386,738,686 B | 242,695,783 B (−37%) |
| installed packages (`dpkg -l`, `^ii`) | **266** | **133** (−50%) |

The old image is still on this machine as `covenant-browser-sandbox:dev`, which
is where the "before" column was measured (`:latest` is now the new one).

Largest remaining costs: `/opt/chrome-headless-shell` 261 MB (the browser
itself), then the mesa chain described under Concerns, then `fonts-noto-core`
42 MB.

## Verification

**1. Build.** `docker compose --profile build-only build browser-sandbox` from
the repo root, clean, tagging `covenant-browser-sandbox:latest`. The in-build
version step printed `Google Chrome for Testing 152.0.7977.75`.

**2. Container tests.** They were **not** skipped — `dockerSandboxReady` found
Docker and the image, and the suite launched a real container (its own
`docker inspect` assertions against a running container prove it):

```
pnpm exec vitest run packages/browser-drive/tests/container-session.test.ts \
                     packages/browser-drive/tests/container-lockdown.test.ts

 Test Files  2 passed (2)
      Tests  41 passed (41)
   Duration  3.50s
```

The full repo suite was also run in passing and is green: **313 files, 2896
tests passed**.

**3. Screencast / Devanagari.** A throwaway vitest file (deliberately kept out
of the commit; a copy is in the session scratchpad as `zz-image-check.test.ts`)
drove the real image through the package's own `containerRunArgs` /
`containerChromeArgs` / `ContainerPipe` — the same locked-down `docker run` and
the same CDP-over-pipe transport `ContainerLauncher` uses — and asserted three
things:

- **The baked shop, over CDP.** `Page.captureScreenshot` on
  `file:///opt/covenant/fixtures/shop/index.html` returned a PNG that decodes to
  **483 distinct colours and 9,508 dark pixels**. Not blank.
- **Devanagari really shapes, not tofu.** `page.setContent` with
  `<span id="d" style="font:96px sans-serif">नमस्ते</span>`;
  `getBoundingClientRect` measured the span at **202 px** wide and `textContent`
  read back `नमस्ते` intact. The screenshot's **longest unbroken horizontal run
  of dark pixels is 203 px** — the शिरोरेखा, the bar across the top of the whole
  word. Six fallback tofu boxes cannot make one: they would break into six short
  runs with white gutters between them. So the glyphs come from
  `NotoSansDevanagari` in `fonts-noto-core` and the text is shaped, not boxed.
  (Total ink 5,030 px.)
- **The live window still moves.** `Page.startScreencast` on this browser was
  the real risk — `chrome-headless-shell` is the old headless implementation and
  puppeteer's own recorder refuses to run on it. It works: **2 screencast frames
  arrived** (8,996 and 17,624 base64 bytes) across a navigation to
  `product.html`. The shopper's window is not going to freeze.

**4. `--headless=new`.** The shell **accepts and ignores** it — it is always
headless. Verified directly (`chromium --headless=new --user-data-dir=…
--hide-scrollbars --dump-dom` under the real `--cap-drop ALL --cap-add
SYS_CHROOT` + seccomp flags returned the fixture DOM, exit 0) and again by the
whole container suite launching. **`containerChromeArgs` is unchanged** and no
test needed adjusting.

**5. Docker Scout.** `docker scout quickview covenant-browser-sandbox:latest`
answers *"Log in with your Docker ID or email address to use docker scout."* Not
logged in, and the brief says not to, so **there is no before/after CVE number
in this report**. No other scanner (trivy, grype, syft) is on this machine. The
proxies are above: half the packages, a current stable base instead of one a
release behind, and a browser one major version newer that is now pinned and
updated deliberately rather than by whatever Debian last shipped.

## Concerns

1. **`fonts-noto-cjk` is dropped.** ~190 MB installed, about a fifth of the new
   image, for scripts no shop in this errand's reach uses. A CJK page renders
   tofu in this sandbox now. Named as a DECISION comment in the Dockerfile so it
   is a choice on record and one line to reverse.
2. **`libgbm1` is expensive and unavoidable.** The shell has `libgbm.so.1` in
   its NEEDED list; Debian's `libgbm1` depends on `mesa-libgallium` (= exact
   version), which depends on `libllvm19`, which depends on `libz3-4` — roughly
   **195 MB of software rasteriser** for a container with no `/dev/dri` in it.
   It is the single largest remaining chunk after the browser. Cutting it would
   mean shipping a deliberately broken dpkg state, which is worse than the
   megabytes.
3. **No CVE delta** — see verification 5.
4. **The browser is now pinned by hand.** Before, `apt-get` moved Chromium with
   Debian; now a browser security release means editing `ARG CHROME_VERSION` and
   rebuilding. That is the trade for reproducibility, but it needs an owner. The
   lookup URL is in the Dockerfile comment directly above the pin.
5. **The build now reaches storage.googleapis.com.** Previously the only network
   dependency at build time was the Debian mirror. An air-gapped rebuild needs
   the zip staged locally.
6. **`chrome-headless-shell` is the old headless implementation.** No
   extensions, no printing, no `--headless=new` semantics — none of which this
   package uses. The two capabilities that mattered were checked directly and
   both work: `Page.captureScreenshot` and `Page.startScreencast`.
7. **No setuid `chrome-sandbox` in the image any more**, and none is wanted: the
   run grants `CAP_SYS_CHROOT` and the seccomp profile permits `CLONE_NEWUSER`,
   so Chrome builds its namespace sandbox itself. The container suite's "started
   Chrome with its own sandbox intact" case is the proof — nothing passes
   `--no-sandbox` and Chrome refuses to run without a usable one.
8. **Chrome's stderr is noisier** on this base (D-Bus not reachable, no DRM
   device, Floss/bluetooth absent). All expected in a container with no system
   bus and no GPU; they are warnings, not failures, and the session works.

---
# task-C-review-report

# Task C review — a lighter browser sandbox image

**Spec compliance: ✅**
**Quality: Approved**

## Spec compliance (against task-C-brief.md)

- ✅ Base `debian:trixie-slim` in both stages (confirmed in Dockerfile; `docker history` base layer is `debuerreotype 0.17` trixie).
- ✅ `chrome-headless-shell` from Chrome for Testing, pinned as `ARG CHROME_VERSION=152.0.7977.75` with the lookup URL in the comment directly above it (Dockerfile:17-20).
- ✅ Downloaded in a dedicated `fetch` build stage with `curl` + `unzip`, from exactly the URL pattern the brief specifies (Dockerfile:26-38).
- ✅ Runtime library list is evidence-driven, not the brief's starting list verbatim — verified independently: ran `ldd /usr/bin/chromium` inside the built `:latest` container myself; every one of its ~40 `NEEDED` entries resolved (zero "not found"), and every package the Dockerfile installs for a shared object (`libasound2t64`, `libatk-bridge2.0-0t64`, `libatk1.0-0t64`, `libatspi2.0-0t64`, `libdbus-1-3`, `libexpat1`, `libgbm1`, `libglib2.0-0t64`, `libnspr4`, `libnss3`, `libx11-6`, `libxcb1`, `libxcomposite1`, `libxdamage1`, `libxext6`, `libxfixes3`, `libxkbcommon0`, `libxrandr2`) maps to something the binary actually links. Nothing installed is dead weight. The implementer correctly dropped the brief's suggested `libcups2`/`libpango-1.0-0`/`libcairo2` (not linked) and added `atk-bridge`/`atk`/`atspi` (are linked, not in the brief's list) — evidence over the brief's starting guess, as instructed.
- ✅ `ca-certificates`, `coreutils`, `fonts-liberation`, `fonts-noto-core` all present.
- ✅ `fontconfig-config` — the non-obvious add — is real and load-bearing; the Dockerfile comment explains why `ldd` can't see it.
- ✅ `fonts-noto-cjk` dropped with a `DECISION:` comment (Dockerfile:71-74) that names the reversal ("Put it back the day one of them matters"). Defensible for an India-first shopper — Hindi/Devanagari is the addressed market, CJK is not.
- ✅ Indic font coverage confirmed directly (not via `fc-list` — see Quality finding 3 below): `find /usr/share/fonts -iname '*Devanagari*' -o -iname '*Tamil*' -o -iname '*Bengali*' -o -iname '*Gujarati*'` inside the built image lists `NotoSansDevanagari`, `NotoSansTamil`, `NotoSansBengali`, `NotoSansGujarati` (Sans+Serif, Regular+Bold) all present under `fonts-noto-core`.
- ✅ Image contract intact, confirmed on the built image (`docker run --rm --entrypoint sh covenant-browser-sandbox:latest -c '...'`):
  - `uid=1001(shopper) gid=1001(shopper)`
  - `/home/shopper/profile/Default` and `/home/shopper/downloads` both `drwxr-xr-x shopper shopper`
  - `/opt/covenant/fixtures/shop` present (root-owned 755, same as original pattern — brief doesn't require shopper ownership here)
  - `/usr/local/bin/entrypoint.sh` is `-r-xr-xr-x` (mode 0555), unchanged, untouched by the commit
  - `readlink -f /usr/bin/chromium` → `/opt/chrome-headless-shell/chrome-headless-shell`; `/usr/bin/chromium --version` → `Google Chrome for Testing 152.0.7977.75`, matching the pinned `ARG` exactly
  - Same `ENV` names/values (`COVENANT_PROFILE_DIR`, `COVENANT_DOWNLOAD_DIR`, `COVENANT_TTL_SECONDS=900`), same `ENTRYPOINT`, `USER shopper`, `WORKDIR /home/shopper`
- ✅ Symlink approach used (preferred per brief) — `docker/entrypoint.sh` is not in the diff at all.
- ✅ `--headless=new` handling verified by the report as accepted-and-ignored; `containerChromeArgs` untouched — confirmed no `.ts` file appears in `git show --stat 54a3240` (Dockerfile only).
- ✅ Lockdown surface untouched: `docker-args.ts` / seccomp not in the diff.
- ✅ `docker-compose.yml` not touched.
- ✅ Commit is path-scoped to `packages/browser-drive/Dockerfile` only (`git show --stat`: 1 file, 100 insertions, 7 deletions), single evocative sentence, correct trailer with a blank line before it (`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- ✅ Build hygiene: multi-stage confirmed by `docker history --no-trunc` on `:latest` — the shipped image's layer list has no `curl`/`unzip`/zip layer at all, only the runtime `apt-get` layer, the `COPY --from=fetch` of the already-extracted directory, and the rest of the contract. Confirmed directly: `command -v curl/unzip/wget` all report absent inside the running image. `--no-install-recommends` used in both stages. `rm -rf /var/lib/apt/lists/*` present in the **runtime** stage (Dockerfile:99); see finding 1 for the fetch stage.
- ✅ Comments throughout are "why," not "what" (DECISION comments, the fontconfig-config story, the libgbm1 cost accounting, the symlink/`/proc/self/exe` reasoning).
- ✅ Numbers in the report cross-checked on this machine and match exactly: `docker image ls` → `:latest` 892MB / `:dev` 1.32GB; `docker image inspect --format='{{.Size}}'` → 242,695,783 B; `dpkg -l | grep -c ^ii` → 133.
- ✅ Docker Scout gate not bypassed — reran `docker scout quickview covenant-browser-sandbox:latest` myself, got the same "Log in with your Docker ID..." message, not logged in as instructed.

## Tests — verified myself

```
pnpm exec vitest run packages/browser-drive/tests/container-session.test.ts packages/browser-drive/tests/container-lockdown.test.ts

 Test Files  2 passed (2)
      Tests  41 passed (41)
   Duration  3.84s (transform 323ms, setup 0ms, import 715ms, tests 3.07s, environment 0ms)
```

None skipped — both files ran against the real `:latest` image (this run launched real containers; matches the report's own 41/41 result, only duration differs by run-to-run noise).

## Quality findings

1. **Dockerfile:28-38 (fetch stage) — no `rm -rf /var/lib/apt/lists/*`.** The runtime stage cleans apt lists (Dockerfile:99) but the fetch stage doesn't. **Why it matters:** effectively nothing — `COPY --from=fetch` only pulls `/opt/chrome-headless-shell` into the final image, so this never reaches the shipped artifact; it only leaves a few hundred KB in the discarded intermediate stage / local build cache. **Fix:** append `&& rm -rf /var/lib/apt/lists/*` to the fetch-stage `RUN` for consistency. Cosmetic only.

2. **Dockerfile:32-33 — download has no checksum verification, only HTTPS.** Checked directly: Chrome for Testing's `known-good-versions-with-downloads.json` entries carry only `platform` and `url`, no `sha256`/`sha1`/`md5`, and there's no published checksum manifest for these artifacts anywhere in Google's docs. So this is a real, upstream gap, not an oversight — HTTPS-to-`storage.googleapis.com` is the ceiling of what Google's own distribution offers today. **One-line improvement anyway:** Google Cloud Storage returns an `x-goog-hash` (crc32c + md5) response header per object; capture that once at pin time and add `curl -fsSL ... -o /tmp/shell.zip && echo "<pinned-md5>  /tmp/shell.zip" | md5sum -c -` (self-supplied pin, not vendor-published, but catches corruption/substitution). This is a finding for the record, not a rejection, per the brief's own framing.

3. **Verification-tooling note, not a Dockerfile defect:** the brief's exact check (`fc-list | grep -ci devanagari`) doesn't run against this image — `fontconfig-config` is installed but `fontconfig` (which provides the `fc-list` binary) deliberately isn't, since Chrome carries its own fontconfig. Substituted `find /usr/share/fonts -iname '*Devanagari*' ...` instead and confirmed all four scripts present (see compliance section above). Worth noting in case a future reviewer runs the brief's literal command and gets confused by "not found" rather than an empty match.

4. **Minor comment-completeness nit, Dockerfile:45-52.** The comment names only `libdrm2`, `libudev1`, `libcap2` as transitive-not-named-twice deps; my own `ldd` run shows several more resolve transitively too (`libXrender.so.1`, `libXi.so.6`, `libXau.so.6`, `libXdmcp.so.6`, `libselinux.so.1`, `libsystemd.so.0`, `libmount.so.1`, `libblkid.so.1`, `libpcre2-8.so.0`, `libffi.so.8`, `libz.so.1`, `libatomic.so.1`). All resolve fine (the build-time `ldd | grep "not found"` gate is the real safety net, not the comment), so this is purely a documentation completeness nit, optional to fix.

None of these block approval — the image contract, build hygiene, library selection, and Indic-font coverage all check out against the built artifact, and the test suite is genuinely green with nothing skipped.
