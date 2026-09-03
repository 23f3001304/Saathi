# SDD ledger — plan: docs/superpowers/plans/2026-09-02-llm-native-turn-engine.md

Branch: llm-native-turn-engine (from gemini @ a4cfd60; merge target gemini; master is stale at df84095). Setup commit b65e71f (.gitignore .superpowers/).
Baseline: tsc clean; vitest 6 failures/4 files (consumed by Stage 1); eslint 3 pre-existing max-lines errors (intent-drafter.ts, turn-plan-tools.ts, openai-agent-session.ts)
Spec: docs/superpowers/specs/2026-09-02-llm-native-turn-engine-design.md
Ruling: spec §6.4 'planner threw → failed' vs plan Task 7 'wrap-up turn, else empty answer' — plan's shape accepted (assembler); costs only the outcome state on a provider outage, no fixed sentence either way.


## Pre-flight scan

Method: per-task Files / Interfaces / git-add blocks extracted (`scan-extract.txt`, deleted after); every task's full text read; disk facts the tests assume verified by grep (fake-shop tile order and prices, DEMO_CATALOG kurta prices/categories, `CartAssembly.reasonCode: ReasonCode`, `REASON_HUMAN: Record<ReasonCode,string>`, `DEMO_MERCHANT_ISS`/`findSku` exports, `turn-dispatch`/`turn-shapes` fixture skus, `stated-budget.test.ts` imports, `errand-bounds.test.ts` expiry cases, `turn-plan-prompt.test.ts` `closing` const, `working-context.test.ts` helpers, `buy-step.ts` `request`/`present(request)`, `RunNarrator` ctor callers, `buyer-wiring.ts`/`lane-wiring.ts` function names, `context-rig.ts` `stillParts`/`RUN_CONFIG`).

### Pair rows (shared file or interface; earlier Produces vs later Consumes)

| Tasks | Produces → Consumes | Finding |
|---|---|---|
| 1 → 24, 26 | `ErrandPrompts {look, summarise: () => string}` → T24 `summarise: (ended: ErrandEnd) => string`; T25/T26 pass `(ended) =>` closures; T24 notes the zero-arg closures T1 left are assignable | consistent |
| 1 → 27 | `Spoken {told, expired}` → T27 keeps the same shape | consistent |
| 1 → 7 | `turn-planner.ts` `plan()`/`speak()` without `correction` → T7 edits `unchosen`/`plan` (`return await this.unchosen`) on that text | consistent |
| 1 → 19 → 20 | `planned-turn.ts` single `planner.plan(lines, replyLanguage, digest)` → T19 adds `repropose` closure + `{...parts, repropose}` → T20 inserts `pending.hold` between them | consistent (each edit names its anchor line) |
| 1 → 20 | `TurnPlanner.plan(stated, replyLanguage?, context?)` → T20 `PlanDraftJudge` does not call it; `turn-plan-prompt.test.ts:62` fixed in T1 | consistent |
| 2 → 19 | `RunnerParts.offered` untouched by T2 (typed pick removed) → T19 `TurnParts.offered: {current()}` (WebOffered has `current()` from T12); T2's `planner-owns-the-pick.test` overrides `offered` with `{live, claim}` only, but an `answer` plan never reaches `pickTurn` | consistent |
| 2 → 3 | T2 rewords the `context-record.ts` comment that named `noStockTurn` → T3 deletes `no-stock-step.ts`; T3 grep expects only `purchase-runner.ts` | consistent |
| 3 → 18 → 20 | `drafter-refusal.test.ts` imports `NothingStocked` from `judge/catalog-match` → T18 repoints to `session/catalog-match` → T20 keeps `NothingStocked` in scripted judge | consistent |
| 4 → 13 → 20 → 28 | `runner-wiring.ts`: T4 `narratorOf` 3 args; T13 adds `language: deps.language`; T20 `intentFlowOf(deps, gate, pending)` + `pending: shared.pending`; T28 literal shows `log, lastProposal, pending, cartGate, buyer, refusals` "rest unchanged" | consistent |
| 4 → 28 | `RunNarrator(hub, log, journal)`; T28 emits via hub, not `replay` | consistent |
| 5 → 10 → 14 → 16 | `turn-plan-tools.ts`: T5 drops `thing_settled`/`fresh_search`; T10 `declareTool`, `MOVES` + `TURN_PLAN_TOOLS = [...MOVES, ...PLANNER_READ_TOOLS]`; T14 rewrites BROWSE description, imports `SEE_SHELF_TOOL`; T16 replaces browse/propose, adds pick inside `MOVES`, says "add only imports not already there" | consistent |
| 5 → 11 → 16 | Collector ctor `(context)` → `(context, reads)` → T16 whole-file `(context, reads, bounds)`; T16 `read()` = T11 body with `refused("read_failed", {detail})` producing `{ok:false, failure:"read_failed", detail}`; `refused("no_reads")` spreads `{}` → matches T11's `toEqual({ok:false, failure:"no_reads"})` | consistent |
| 6 → 16 | T6 `recordAmendment` records nothing on refusal → T16's replacement `recordAmendment` does the same | consistent |
| 6 → 11 | `covenant-amendment.test.ts` uses `new TurnPlanCollector()` → still valid with defaulted `reads`/`bounds` | consistent |
| 8 → 25 | `cardedListings(listings)`, `webOptionRows(listings)` → T25 call sites one-arg; `ReportRequest.query` kept in T8, removed in T25 with `opened` | consistent |
| 8 → 25 | `web-options.test.ts`: T8 rewrites two cases, T25 deletes the "harness promises" describe | consistent (different describes) |
| 10 → 15 | `turn-plan.ts` constants after `REMEMBER_TOOL` (T10 adds SEE_*; T15 adds PICK_TOOL); `index.ts` additive | consistent |
| 10 → 16 | `turn-moves-declared.test.ts` `toEqual` list with reads (T10) → T16 replaces with `toContain` + `indexOf(PICK) === indexOf(PROPOSE)+1` | consistent |
| 12 → 13 | `StateSources` → `plannerReadsOf` passes `WebOffered` (has `current()`), `WebPickPark` (`held/reason/parked`), `WebProgress`, `WebFindings`, `BrowserService` (`current(): BrowserSession|null`), `CredentialVault.list`, `ContextRecorder` (extends `ContextView`), `TurnLanguage`, `readCurrent` bound | consistent |
| 12 → 23 → 25 | `windowOwnerOf(state: string|null)` in `state-view-parts.ts` → T23 re-exports → T25 `LookWatch.window.current(): {currentState(): string}` | consistent |
| 13 → 19 → 20 | `turn-harness.ts`: T13 adds `language` in `webParts()`; T19 changes `offered` in `webParts()`; T20 adds `pending` after `lastProposal` | consistent (distinct lines) |
| 13 → 20 | `lane-wiring.ts` rewrite still imports/uses `wireJudgeSession`, `judgeSession` (BuyerDeps has it until T20) → T20 deletes the import, the `laneSessions` line, `BuyerDeps.judgeSession`, `wireJudgeSession` | consistent |
| 13 → 20 | `wireBuyer` reads `deps.gates.*` (T13) → T20's replacement body keeps that and adds `pending` | consistent |
| 15 → 16 | `draftOf`, `DraftBounds`, `DRAFT_ARGS_SHAPE` → T16 `proposeRecorded`, declaration `{reply, ...DRAFT_ARGS_SHAPE}`, tests' `BOUNDS` | consistent |
| 15 → 18, 19, 20 | `TurnPlan.skus/ref/draft` → `browseTurn` reads `plan.skus`; `pickTurn` reads `plan.ref`; `planned()` holds `plan.draft` | consistent |
| 16 → 17 | `PICK_TOOL` in prompt; T17 test string "A read (see_shelf, see_state) is not a move" equals the concatenated `moveRule()` text | consistent |
| 18 → 20 → 21 | `static-prompt-judge.ts`: T18 fixes its `catalog-match` import in `judge/`; T20 `git mv` to `session/` and repoints both imports; T21 swaps `draftFieldsFor` import to `./scripted-draft.js` | consistent |
| 20 → 21 | `draft-plan.ts`: T20 exports `envelopesFor` (keeps `draftFieldsFor`); T21 trims to `DraftPlanConfig` + `envelopesFor`, moves `draftFieldsFor`; `refundability-bound.test.ts` import repointed in T21 | consistent |
| 20 (contract) | spine `PlanDraftJudge(pending, config)` + prose "also takes shelf" vs Reconciled list `(pending, config, shelf)` → T20 code and tests use 3 args | consistent (Reconciled list governs) |
| 23 → 24 | `ErrandEnd` from `observed-block.ts` → `errand-run.ts` imports type; no import cycle (`observed-block` → `browser-view`, `state-view-parts` only) | consistent |
| 24 → 25, 26 | `sayOnly`, `runErrand` with `summarise(ended)` → T25 `attempt`, T26 `errand()`/`afterword`/`stillTheirs` | consistent |
| 23 → 25, 26 | `factsFrom(progress, over)`, `ProgressView` (needs `signedIn`, `awaitsCode`) → `WebProgress` gains `signedIn` getter in T23; `awaitsCode` exists | consistent |
| 26 → 27 | `close(base, ref, from, spoke, fallback)` and `ResumeParts.close(base, ref, from, said)` kept by T26; T27 tidies both to `(base, ref, said)` and the `resumePick` call | consistent |
| 26 → 27 | T26 imports `settleAs` (kept by T27), drops `emitLine`; T27's `emitLine(hub, text)` 2-arg used only inside `web-pick-close.ts` | consistent |
| 27 tests ↔ 26 tests | `web-address-confirm.test.ts` / `web-pick.test.ts`: T26 rewrites one describe each, T27 the rest | consistent (named describes differ) |
| 28 ↔ cart-builder | `explainRefusal(parts, assembly.reasonCode)` needs `ReasonCode` → `CartAssembly` is `{ok:false; reasonCode: ReasonCode}` on disk | consistent |
| 28 ↔ e2e | scripted voice emits `REASON_HUMAN[code]` as a message; `e2e-purchase.test.ts:183` asserts only `cartRefusal` | consistent |
| 24 ↔ errand-bounds existing cases | "runs past its wall clock" (`told === ""` when `converse` is `NEVER`: the afterword also hangs → `""`) and "abandons the conversation" (`reset` count stays 2: once at open, once in `abandoned`; `sayOnly` does not reset) | consistent |
| 9 / 22 / 30 | eslint expectations: T9 two pre-existing errors (`intent-drafter`, `openai-agent-session`); T22 one (`openai-agent-session`) after T21 splits the drafter; T30 lints a path excluding it | consistent |

### Task rows (self-consistency)

| Task | Finding |
|---|---|
| 1 | self-consistent. Test mutates `runner.parts.planner` through a cast (same object `runnerFor` built); pre-fix the plan gate re-plans the Hindi reply and emits `LANGUAGE_SLIPPED`, so both assertions fail as stated. |
| 2 | self-consistent, one cosmetic slip: Step 2's expected failure text. `forbidden("webPick.buy")` is a Proxy *object*, so `parts.webPick.buy(...)` throws `TypeError: ... is not a function`, not "webPick.buy.buy ran on a conversational turn". The test still fails pre-fix. `working-context.test.ts` helpers (`recorderRig`, `asked(text, index)`, `CHAT`, `revived`, `live`) exist on disk. |
| 3 | self-consistent (`stillParts().hub`, `RUN_CONFIG` exist; `intents.sign` is awaited before `buyer.converse` in `buyThrough`). |
| 4 | self-consistent. `present()` test says "in the shop's order" while `presentListings` sorts `price_asc`; the two rows share a price so a stable sort keeps insertion order. `buy-step.ts` `request` is used only at the `present(request)` call. `RunNarrator` has exactly the two 4-arg callers named. |
| 5 | self-consistent. |
| 6 | self-consistent. |
| 7 | self-consistent (`Unfinished` satisfies the structural `AgentSession` the existing test already used). |
| 8 | self-consistent. Fake shop RESULTS order Red (₹2,499) → Blue (PRODUCT_BLUE) → Trail → Sock ("20% off", no card); RESULTS_AGAIN re-lists Red under another URL and dedupes by title+price, so the expected `[Red, Blue, Trail]` and `options[0].pricePaise === 249_900` hold. |
| 9 | self-consistent. |
| 10 | self-consistent (no import cycle: `turn-plan-declare` → `turn-plan`; `planner-reads` → both; `turn-plan-tools` → both). |
| 11 | self-consistent. |
| 12 | self-consistent (vault host normalises `www.amazon.in` → `amazon.in`; `checkoutOf` returns null only when nothing is parked, carted, or driving). |
| 13 | self-consistent; `lane-wiring.ts` near the 200-line cap, split named (`lane-parts.ts`). `loadConfig` with only the two env keys yields scripted mode with a minted browser key. |
| 14 | self-consistent (`TURN_PLAN_PROMPT` contains no "matches" today; the count lived in the tool description). |
| 15 | self-consistent. |
| 16 | self-consistent. Constraint watch: `movePlan` has six `case`s plus `default`, cyclomatic ≈ 7–8; if `complexity` trips, table the last two moves. `turn-plan-record.ts` ≈ 170 lines. |
| 17 | self-consistent (`closing` const exists at `turn-plan-prompt.test.ts:82`). |
| 18 | self-consistent (DEMO_CATALOG: NF 141000, ST 129900, AG 134900, all `apparel`; `turn-dispatch` fixture sku `RUN-RED-8`, `turn-shapes` `sku_kurta_navy`). |
| 19 | self-consistent (`pickTurn` imports only `ask-step`; `repropose` is a closure, so no `turn-step` ↔ `purchase-runner` cycle). |
| 20 | self-consistent, one style note: `PlanDraftJudge.judge(promptId, _input, schema)` uses an underscore parameter, which Task 4 states this repo does not use. ESLint has no explicit `no-unused-vars` args setting, so the recommended `after-used` default flags neither `_input` nor `input`. Envelope expectation `apparel × 2_000_000` matches `envelopesFor` (10× cap). |
| 21 | self-consistent (`stated-budget.test.ts` imports only vitest and the module, so the verbatim copy needs only the one import change; `export *` names do not collide after the drafter split). |
| 22 | self-consistent. |
| 23 | self-consistent (13 assertions; block order matches `observedBlock`). |
| 24 | self-consistent (see pair row on the existing expiry cases). |
| 25 | self-consistent; `web-look-step.ts` near the cap, the plan names what to shorten. Test "counts only the pages this turn reached" relies on `from = trail.length` captured before the errand, which the disk `look()` does. |
| 26 | self-consistent; `web-buy-step.ts` near the cap, split named (`pick-facts.ts`). `from` is captured before `sandbox.open`, so the product page counts as the one page opened. |
| 27 | self-consistent (`parkReasonOf` reproduces the disk's `awaitsCode` → `awaitsAddress` → `resumable` order; `detailOf` unchanged). |
| 28 | self-consistent (`assembly.reasonCode` is already `ReasonCode`). |
| 29 | self-consistent (greps only). |
| 30 | self-consistent. |

### Global-constraint check

No shown code exceeds 200 lines per file or 40 per function; three files are near the file cap and each task names its split (T13 `lane-wiring.ts`, T25 `web-look-step.ts`, T26 `web-buy-step.ts`). No `any`. No em dash in any prompt or shopper-facing string (the em dashes present are inside test fixtures quoting model output). No regex over shopper or model text is introduced; the only new regexes are `shopOf`'s `^www\.` strip (URL hygiene) and zod shapes. No fixed sentence is emitted as a message or question beat by any task; the shell's remaining strings are tool-result notes, prompts, and the window-card chrome the spec keeps.

### Reviewer-defect check

No test asserts nothing. No logic block is duplicated verbatim across tasks (the collector's `read()` is deliberately re-stated in T16's whole-file replacement and the plan says so). Files replaced whole by a later task after an earlier edit (`turn-plan-collector.ts` T5/T6/T11 → T16; `errand-run.ts` T1 → T24; `web-pick-close.ts` T1 → T27; `browse-step.ts` T4 → T18; `lane-wiring.ts` T13 → T20 edits) all say so in the later task.

### Findings and rulings (none block execution)

- Task 2, Step 2 — SELF-CONFLICT (cosmetic): expected-failure message names a thrown string the Proxy cannot produce. Ruling: proceed; the implementer confirms the test fails (TypeError) and does not chase the quoted text. Cost if wrong: none.
- Task 20, Step 5 — style: `_input` parameter. Ruling: implementer names it `input` (unused-before-used is not flagged); no behaviour change. Cost if wrong: one lint round.
- Task 16 — constraint watch: `movePlan` complexity at the edge. Ruling: if `complexity` trips, hoist `DECLINE_TOOL`/`WEB_LOOK_TOOL` into a `simpleMoves` map; no design change. Cost if wrong: one lint round.
- Task 4 — cosmetic: "in the shop's order" comment over a price-sorted presentation with tied prices. Ruling: leave; behaviour asserted is correct under a stable sort. Cost if wrong: none.

Scan result: 39 pair rows, 30 task rows, 0 blocking conflicts, 4 advisory rulings above.

## Rulings (pre-flight, accepted)
Ruling: Task 2 Step 2 expected-failure text names a string a Proxy cannot throw — implementer confirms the test fails, ignores the quoted text — cost if wrong: none.
Ruling: Task 20 Step 5 underscore param — implementer names it `input` — cost if wrong: one lint round.
Ruling: Task 16 `movePlan` complexity ≈ 8 — hoist DECLINE/WEB_LOOK into a `simpleMoves` map only if `complexity` trips — cost if wrong: one lint round.
Ruling: Task 4 test comment wording ("shop's order" over a stable price_asc sort) — leave — cost if wrong: none.
Ruling: Stage 5 (Tasks 31–37, OpenAI-only providers + stale sweep) is being appended by a writer fork; it gets its own pre-flight rows before Task 31 is dispatched — cost if wrong: a late conflict caught at Task 31's scan.

## Execution
Task 1: BASE b65e71f

## Rulings (Stage 5, accepted from the writer)
Ruling: Stage 5 tasks cut by provider (31 Claude, 32 Gemini, 33 Sarvam+router), not by layer — narrowing AGENT_PROVIDERS is a type error in every Record<AgentProviderId,…> table, so layer order leaves the tree red — cost if wrong: none (same deliverables).
Ruling: indic_chat class + indic capability + TaskFeatures.script removed with INDIC_BONUS — with no Indic-capable model a Devanagari turn would find zero rungs and throw NoCandidateModelError — cost if wrong: Hindi shoppers route as ordinary chat (which is what OpenAI-only means anyway).
Ruling: LadderRequest.features removed (unused once the bonus is gone); requireApiKey removed from AgentSessionRequest (Claude CLI login only) — cost if wrong: one revert.
Ruling: only README, Dockerfile, docs/backend-architecture.md updated; ../ARCHITECTURE.md (submission doc, outside the repo) left for the founder — cost if wrong: a stale line in the submission doc, flagged in the final summary.
Ruling: DEFAULT_AGENT_MODEL in provider-config becomes "gpt-5.6"; agent-host config's own default "gpt-5.6-luna" is what runs — cost if wrong: none at runtime.
Task 1: implementer DONE_WITH_CONCERNS (commit 0027123; +2 test doubles fixed for plan() arity: context-turns, context-compaction); review dispatched (opus) on review-b65e71f..0027123.diff
Task 1: first reviewer stopped by the user before reading; re-dispatched (opus) at user's request

## Pre-flight scan (Stage 5)

Method: Files/Interfaces/Note/git-add blocks of Tasks 31-37 extracted; every Stage 1-30 task touching a file Stage 5 touches cross-checked; each Stage 5 brief read whole; every `git rm` target, importer list, referenced symbol/case name and doc line verified on disk (working tree at scan time, Task 1 implementer running concurrently).

### Pair rows (shared file / interface)
| Pair | Produces vs Consumes | Finding |
|---|---|---|
| T10,T15,T21 -> T31,T32,T33,T35,T36 | `packages/agents/src/index.ts`: Stage 2/3 add/remove `buyer/*` export lines; Stage 5 deletes `sdk/*`, gemini, chat-completions/sarvam, rzp-mcp-mount lines and adds `openai-request` | consistent (distinct lines) |
| T31 -> T32 -> T33 | `provider-config.ts` `AGENT_PROVIDERS` 3 -> 2 -> 1, specs deleted in the same order; T31 "Old" block matches disk lines 1-32 | consistent |
| T31 -> T32 -> T33 | `agent-session-factory.ts`: T31 removes Claude branch/overrides/`apiKeyOf`; T32 removes the gemini branch inside `httpSession` (disk:129); T33 whole file keeps `effortOf`/`COVENANT_OPENAI_REASONING` (disk:88-95) | consistent |
| T31 -> T32 -> T33 | `capability-table.ts`, `discovery-endpoints.ts`, `model-manifest.ts`: entries deleted, then whole-file replaced | consistent |
| T31 -> T33 | `catalog-builder.ts`: T31 import rewrite matches disk:3-9; T33 replaces the `providers` doc | consistent |
| T31 -> T32 -> T33 | `router-wiring.ts`: `CHAT_PROVIDERS` narrowed twice then deleted; the `AgentProviderId` import's only use is that constant (disk:2,42) | consistent |
| T31 -> T32 -> T33 | `agent-session-factory.test.ts`: T31 rewrite has `it.each(["claude"])`; T32/T33 extend the list | consistent |
| T32 -> T33 | `provider-cases.ts`, `provider-wire.ts` (Gemini section marker disk:56), `provider-adapters.test.ts` (destructure disk:20-24, describes 110/127) | consistent |
| T31, T32, T33 | `routing-discovery.test.ts`: Anthropic case disk:43 (T31), `GOOGLE_LIST` disk:21 + case disk:52 (T32); the test reads only `DISCOVERY_ENDPOINTS.openai.url` after T33's whole-file table | consistent |
| T31 -> T33 | `routing-fixtures.ts` `type Provider` disk:19 (T31) then whole file (T33); `routing-ladder.test.ts` `describe("script preference")` disk:62 and `admissibility` disk:45 exist for T33's edits | consistent |
| T31 -> T33 | `live-mode-and-routing.test.ts`: Anthropic case disk:31-33 (T31); Sarvam case 27-29, `keyedProviders` 54-56, `script` 68 (T33) | consistent |
| T33 -> T36 | `openai-agent-session.ts`: T33 adds `ReasoningEffort`; T36 moves it and `OpenAiSessionConfig` into `openai-request.ts` and repoints the factory import T33 introduced | consistent |
| T31 -> T36 | `tool-declarations.ts`: T31 adds `parseWireToolName`/`BUILTIN_TOOL_SERVER`; T36 imports `wireNameOf` from it | consistent |
| T33 -> T36 -> T37 | eslint: T33 expects the pre-existing `openai-agent-session.ts` max-lines error; T36 fixes it; T37 expects clean | consistent (see the T33 self-row for the `&&` chain) |
| T7 -> T31 | `provider-turn-loop.ts`/`guarded-tool-dispatcher.ts` doc rewrites vs `turn-unfinished.test.ts` using `runGuardedTurn` | consistent (comments only) |
| T13 -> T31 | `routed-session.ts`: T13 touches lane-wiring/session-wiring/lane-parts/reads-wiring only; T31's Note "untouched by Stages 1-4" holds | consistent |
| T5,T13,T14,T20 -> Stage 5 | `session-wiring.ts`: Stage 5 does not touch it | consistent |
| T15 -> T31 | `turn-plan.ts`: T15 adds fields; the "Claude-style" comment at disk:68 survives into T31's Step 11 grep | see the T31 self-row |
| T35 -> T36 | `packages/agents/src/index.ts`: T35 deletes the rzp line; T36 adds the openai-request line | consistent |
| T31 -> T34 | every `@anthropic-ai/claude-agent-sdk` import is deleted in T31 (factory:1, sdk/*); T34 drops the dependency afterwards; agent-host imports the SDK only through `@covenant/agents` | consistent |
| (none of 1-30) -> T35 | `buyer-prompt.ts`, `apps/audit-ui/**`, `apps/merchant-ui/**`: no Stage 1-4 task touches them | consistent |
| T31 -> T33 | `apps/agent-host/src/config.ts`: T33 rewrites the `keyedProviders` doc (disk:171-178, names Anthropic and Sarvam); T31's Step 11 grep runs first | see the T31 self-row |

### Task rows
| Task | Finding | Proposed ruling |
|---|---|---|
| T31 | SELF-CONFLICT: Step 11 grep `-i "claude\|anthropic\|sdk/"` over `packages/agents/src apps/agent-host/src` expects empty but will hit stale comments the task never edits: `packages/agents/src/buyer/turn-plan.ts:68` ("Claude-style"), `packages/agents/src/providers/sse-stream.ts:7,31` ("Anthropic"), `packages/agents/src/routing/routed-session-parts.ts:16` ("`null` on Claude, where the Agent SDK's own hook is the gate"), `packages/agents/src/shared/agent-session.ts:42,45` ("Claude Agent SDK", "ANTHROPIC_API_KEY"), `apps/agent-host/src/config.ts:176` ("requiring Anthropic specifically"; T33 edits it later). Everything else verified on disk: `providerModelEnvKey`, `capturingFetch`, `RecordingDispatcher`, `RecordingSink`, `hookOf`, `guard.blocked/seen`, `provider-live.test.ts` 48-52/106 (`AgentProviderId` still used at 64), `routing-fixtures.ts:19`, `guarded-tool-dispatcher.ts` class doc 13-27 carries the Gemini/Sarvam sentence, all `git rm` targets exist, `git add` list matches Files. | Spec (§1 Claude leaves whole; §5 the sweep must be honest): T31 Step 8 also rewrites those five comments (turn-plan.ts:68 drops the vendor name; sse-stream.ts:7/31 name wire shapes, not vendors; routed-session-parts.ts:16 -> "`null` only for a session a test builds without a guard"; agent-session.ts:42-45 drops the SDK paragraph; the `keyedProviders` doc rewrite moves from T33 Step 6 to T31 with T33's wording). Cost if wrong: one grep/lint round. |
| T32 | SELF-CONFLICT: Step 5 grep `-i "gemini\|google"` over src expects empty but hits `packages/agents/src/providers/sse-stream.ts:7` ("Gemini") and `apps/agent-host/src/browser/browser-view.ts:59` ("Google redirect's whole tracking payload", a correct comment about a URL shape). Rest verified (factory `httpSession` disk:129; provider-adapters destructure/describe; provider-wire marker; `GOOGLE_LIST`). | sse-stream.ts:7 is fixed by the T31 ruling; the T32 grep drops `google` (the redirect comment stays). Cost if wrong: one grep round. |
| T33 | SELF-CONFLICT (a): Step 9 grep `-i "sarvam\|chat-completions\|indic\|scriptOf\|INDIC_BONUS\|CHAT_PROVIDERS"` expects empty but hits `packages/agents/src/providers/openai-agent-session.ts:45` ("Sarvam uses it", rewritten only in T36) and `apps/agent-host/src/obs/wire-trace.ts:46` ("Chat Completions (Sarvam)", untouched by any task). (b): Step 10 runs `eslint ... --max-warnings 0 && pnpm depcruise` while expecting eslint to exit 1 on the pre-existing max-lines error, so depcruise never runs. Rest verified: `kinds()` fakes:104, `calls` doubles:52, `loggerAnd` returns `{logger, env}`, routing-catalog cases 44/89, routing-classification `classOf` + cases 30/81/95, provider-streaming `CHUNKS`:70 + describe:77, model-router.ts:106 `features,`, escalation-ladder 37/56/90, model-catalog 14-15, live-mode describe:22, inline `reasoningEffort` type at openai-agent-session:31 and factory:51; whole-file replacements 88-120 lines, no `any`. | (a) T33 Step 3 also deletes the `messages` line and its comment from `WireBody` in wire-trace.ts (46-47; only the Responses shape remains) and rewrites openai-agent-session.ts:42-45 to drop the Sarvam sentence (T36 replaces the paragraph anyway). (b) Step 10 runs `pnpm depcruise` as its own command. Cost if wrong: one grep/lint round. |
| T34 | self-consistent (agents package.json:15,22,23; agent-host:20; no direct SDK import survives T31) | none |
| T35 | SELF-CONFLICT (minor): `apps/merchant-ui/serve.mjs:41` ("the agent host and Sarvam's speech API") survives the line-52 edit and trips T37's `*.mjs` sweep. Orphan proof verified: none of the seven has an importer (only the same-named symbols `selectTxnRail`, `AddRule` and the three comments the brief anticipates); `pnpm --dir apps/audit-ui build` = `vite build` exists; `apps/audit-ui/src` lints clean today (exit 0). | T35 Step 3 also rewrites serve.mjs:41 ("names the gateway and the agent host, which is the whole of what this app talks to"). Cost if wrong: one grep round. |
| T36 | self-consistent (README:81, Dockerfile:73-74, backend-architecture 31/251/263/268/1642/2666, `declarationPayload`:179, `requestBody`:120, DECISION paragraphs 42-55, `JsonRecord` wire-json:1, `wireNameOf` import openai-agent-session:17 all match disk) | none |
| T37 | SELF-CONFLICT: Step 3 second grep (`-i "gemini\|sarvam"` over `packages apps` incl. `*.mjs`, excluding only `apps/audit-ui/src/voice/` and `apps/audit-ui/tests/`) expects empty but will hit `apps/audit-ui/serve.mjs:43,71`, the audit UI's own CSP that correctly names `api.sarvam.ai` for speech (spec §1 keeps Sarvam speech), plus `merchant-ui/serve.mjs:41` and the two stale comments unless the rulings above land. The first grep is case-sensitive and passes as written. `--max-warnings 0` over `apps/audit-ui/src`: the eslint hard limits apply to `**/*.ts` only, `.tsx` gets the recommended rules; baseline exit 0. | The T37 grep excludes `apps/audit-ui/serve.mjs` explicitly (its Sarvam lines are the speech key's CSP and stay); the comment fixes are T31/T33/T35's by the rulings above. Cost if wrong: one grep round. |

Constraint check (Stage 5): whole-file replacements are 42-120 lines; no function over 40 lines; no `any`; the one em dash in T31's `provider-config.ts` block ("never from memory — see the tests") is a pre-existing code comment, not a prompt or shopper string. Reviewer-defect mandates: none (T31's "puts the F2 gate on %s" asserts the guard exists with empty ledgers right after build: thin, not empty).

## Rulings (Stage 5 pre-flight, accepted; carry into the dispatch of each task)
Ruling: T31 Step 8 also rewrites stale comments — turn-plan.ts:68 (drop vendor name), sse-stream.ts:7/31 (name wire shapes, not vendors), routed-session-parts.ts:16 (`null` only for a guard-less test session), agent-session.ts:42-45 (drop the SDK paragraph), config.ts keyedProviders doc (T33's wording moves here) — so T31 Step 11's grep is empty — cost if wrong: one grep round.
Ruling: T32 Step 5 grep drops `google` (browser-view.ts:59 redirect comment is correct and stays) — cost if wrong: one grep round.
Ruling: T33 Step 3 also deletes the `messages` line + comment from WireBody in wire-trace.ts:46-47 and rewrites openai-agent-session.ts:42-45 to drop the Sarvam sentence; T33 Step 10 runs `pnpm depcruise` as its own command (not chained after eslint, which exits 1 on the pre-existing max-lines error until T36) — cost if wrong: one grep/lint round.
Ruling: T35 Step 3 also rewrites merchant-ui/serve.mjs:41 — cost if wrong: one grep round.
Ruling: T37 sweep grep explicitly excludes apps/audit-ui/serve.mjs (its CSP correctly names api.sarvam.ai for speech, spec §1) — cost if wrong: one grep round.
Task 1: review approved (0 critical, 0 important); minors deferred: script.ts:118 stale restatesRow comment; errand-bounds.test.ts:19-26 dead stated/replyLanguage fields in promptsFor(); web-errand.ts:55 anchorLine export now module-private-only
Ruling: HEAD 0027123 imported deleted modules from the 5 half-landed uncommitted files — committed them as-is as carry commit c614e9c so every branch commit builds; no new code — cost if wrong: none (later tasks' git add lists simply carry fewer hunks).
Task 1: complete (commits b65e71f..0027123 + carry c614e9c, review clean)
Task 2: BASE c614e9c
Task 2: implementer DONE (commit 965f351); review dispatched (sonnet) on review-c614e9c..965f351.diff
Task 2: review approved (0/0); minor (deferred): planner-owns-the-pick.test.ts:70-73 inert offered stub (brief-mandated)
Task 2: complete (commits c614e9c..965f351, review clean)
Task 3: BASE 965f351
Task 3: implementer DONE (commit 4fb90ae); review dispatched (sonnet) on review-965f351..4fb90ae.diff
Task 3: review approved (0/0/0)
Task 3: complete (commits 965f351..4fb90ae, review clean)
Task 4: BASE 4fb90ae
Task 4: implementer DONE (commit a814c75); review dispatched (sonnet) on review-4fb90ae..a814c75.diff
Task 4: review approved (0/0); minor (deferred): run-narrator.test.ts:52-56 stale LISTING comment about the old filter
Task 4: complete (commits 4fb90ae..a814c75, review clean)
Task 5: BASE a814c75
Task 5: implementer DONE_WITH_CONCERNS (commit 67469d9; stale 'matches' prose in browse-step.ts:15 comment and BROWSE_TOOL description left for Tasks 14/18); review dispatched (sonnet) on review-a814c75..67469d9.diff
Task 5: review NEEDS FIXES — Important 1: BROWSE_TOOL description still promises a `matches` field (turn-plan-tools.ts:308-310); Important 2 (plan-mandated): browsedOutcome() note asserts cards are on screen even on a zero-match browse
Ruling: Task 5 Important 2 — the brief's unconditional SOMETHING_MATCHED note lies on a miss; interim note becomes truthful conditional wording (host cards matching rows IF ANY; never list rows; when unsure of stock, ask or look_on_web). The collector cannot know the count until Task 16 gives it the model's own SKU list, and re-adding a probe would re-add the matcher. Task 16 replaces this note with the shown-count outcome as planned — cost if wrong: one prose round at Task 16.
Task 5: fix round 1/5 dispatched (resume sonnet implementer)
Task 5: fix round 1 implemented (commit 2086415); scoped re-review dispatched (sonnet) on review-67469d9..2086415.diff
Task 5: fix round 1/5 (2 addressed, 0 open — matches prose; BROWSED_NOTE conditional; commits 67469d9..2086415)
Task 5: minor (deferred): browse-step.ts:14-16 stale 'matches: 0' DECISION comment (Task 18 rewrites the file)
Task 5: complete (commits a814c75..2086415, review clean after 1 fix round)
Task 6: BASE 2086415
Task 6: implementer DONE (commit 2b7fcb5); review dispatched (sonnet) on review-2086415..2b7fcb5.diff
Task 6: review approved (0/0); minor (deferred): no test for 'earlier move survives a refused amend' sequence
Task 6: complete (commits 2086415..2b7fcb5, review clean)
Task 7: BASE 2b7fcb5
Task 7: implementer DONE_WITH_CONCERNS (commit 2d3724e; turn-wrap-up.ts extracted for max-lines; provider outage now silent in chat = the ledgered §6.4 deviation); review dispatched (opus) on review-2b7fcb5..2d3724e.diff
Task 7: review approved (0/0); minors (deferred): no test for empty wrap-up text; wrapUpReply ignores turn.done; wrap-up answering via answer_shopper with no prose yields no bubble (controller-specified); PRE-EXISTING: a cut-off turn that recorded only remember_trait stands its draft up as the reply (turn-planner.ts:63 gate chosen===null) — carry to final review; turn-unfinished.test.ts at 198/200
Task 7: complete (commits 2b7fcb5..2d3724e, review clean)
Task 8: BASE 2d3724e
Task 8: implementer DONE (commit 2090851; suite 0 failed); review dispatched (sonnet) on review-2d3724e..2090851.diff
Task 8: review approved (0/0); minor (deferred): web-look-step.ts at 189/200
Task 8: complete (commits 2d3724e..2090851, review clean)
Task 9: BASE 2090851
Task 9: implementer DONE (commit a6a5586; whole-repo vitest 2843/0; depcruise clean; greps empty; web-tools.test.ts describe split for max-lines-per-function); review dispatched (sonnet)
Task 9: review approved; reviewer's lone 'Important' (web-tools.test.ts:149/181 duplicate describe title) is by its own words a readability nit
Ruling: Task 9 duplicate describe title treated as minor (deferred to the final fix wave) — reviewer approved the task and no constraint is broken — cost if wrong: one rename.
Task 9: complete (commits 2090851..a6a5586, review clean)
STAGE 1 COMPLETE at a6a5586: whole-repo vitest 2843 passed/0 failed; tsc, depcruise clean; 2 pre-existing max-lines errors remain (intent-drafter.ts → Task 21, openai-agent-session.ts → Task 36)
Task 10: BASE a6a5586
Task 10: implementer DONE (commit 3d681cd); review dispatched (sonnet)
Task 10: review approved (0/0/0)
Task 10: complete (commits a6a5586..3d681cd, review clean)
Task 11: BASE 3d681cd
Task 11: implementer DONE (commit 07d5d9f); review dispatched (sonnet)
Task 11: review approved (0/0); minors (deferred): throwing-read test does not assert take() null; read_failed detail = raw cause.message (carried into Task 12 dispatch: host reads must not put secrets in thrown errors)
Task 11: complete (commits 3d681cd..07d5d9f, review clean)
Task 12: BASE 07d5d9f
Task 12: implementer DONE (commit ef8dadf; basketOf helper for complexity; test describe split; no test for 'covenant read throws' — Task 13 home); review dispatched (opus)
Task 12: review approved (0/0); minors (deferred): 'WindowOwner' type name in state-view-parts.ts collides with the browser/window-owner.ts class (plan-mandated name; alias when both are needed); untested: intent-over-cart precedence, at_payment true, parked-not-carted basket_holds, windowOwnerOf idle/closed, covenant-read-throws (Task 13 home); findings.find called twice per state()
Task 12: complete (commits 07d5d9f..ef8dadf, review clean)
Task 13: BASE ef8dadf
Task 13: implementer DONE (commit e80de5d; +context-rig.ts language; shopperParts helper; COVENANT_AGENT_MODE env name corrected vs brief; LaneState unexported — Tasks 20/28 may need export); review dispatched (opus)
Task 13: review approved (0/0); minors (deferred): reads-wiring.test.ts:143-145 tautological TURN_PLAN_TOOLS assertion under a misleading it-name; apiVersion header never asserted; reads built for scripted lanes then discarded (inert)
Task 13: complete (commits ef8dadf..e80de5d, review clean)
Task 14: BASE e80de5d
Task 14: implementer DONE (commit 3fabd9f; whole-repo vitest 2861/0; spec paragraph in moveRule() left for Task 17); review dispatched (sonnet)
Task 14: review approved (0/0); minors (deferred): BROWSE_TOOL sentence conflates on-screen cards with the full see_shelf read (Task 17 rewrites); BROWSED_NOTE wording drifts from the description
Task 14: complete (commits e80de5d..3fabd9f, review clean)
STAGE 2 COMPLETE at 3fabd9f: whole-repo vitest 2861 passed/0 failed
Task 15: BASE 3fabd9f
Task 15: implementer DONE (commit f4828e3); review dispatched (sonnet)
Task 15: review approved (0/0); minor (deferred): description.trim() after .min(1) lets a whitespace-only description become empty (brief-verbatim)
Task 15: complete (commits 3fabd9f..f4828e3, review clean)
Task 16: BASE f4828e3
Task 16: implementer DONE (commits a108df3, f21a766; new turn-moves-carry.test.ts for max-lines; 3 turn-planner tests updated for new arg shapes); review dispatched (opus)
Task 16: review NEEDS FIXES — Important 1: turn-unfinished.test.ts stray-call test vacuous (a {} browse is bad_arguments now); Important 2 (plan-mandated): session-wiring.ts passes no bounds (cap/shelf checks inert in production) and the browse note asserts cards the host has not carded
Ruling: Task 16 Important 2 — bounds wiring (capPaise, COVENANT_CURRENCY, merchant.shelf) folded into this fix round because this task introduced the argument; the browse note's tense becomes 'after this turn'; cards-by-SKU in browse-step remains Task 18's — cost if wrong: Task 20 re-touches one line.
Task 16: fix round 1/5 dispatched (resume opus implementer)
Ruling: PLAN GAP — spec §8 says wireTurnPlanner passes draftBounds, but no task (16/18/20) did; closed in Task 16 fix round 1 (session-wiring.ts wires {capPaise, COVENANT_CURRENCY, merchant.shelf}) — cost if wrong: none.
Task 16: fix round 1 implemented (commit d92e90b); scoped re-review dispatched (sonnet)
Task 16: fix round 1/5 (2 addressed, 0 open — vacuous stray-call test; bounds wired + note tense; commits f21a766..d92e90b)
Task 16: minors (deferred): stringsAt neither caps at 4 nor dedupes (cap belongs in browseRecorded); draftOf bad_arguments carries no zod issues; stale count-talk in turn-planner.test.ts:79 and turn-reply.test.ts:22-27
Task 16: complete (commits f4828e3..d92e90b, review clean after 1 fix round)
Task 17: BASE d92e90b
Task 17: implementer DONE (commit 87de58a); review dispatched (sonnet)
Task 17: review approved (0/0/0)
Task 17: complete (commits d92e90b..87de58a, review clean)
Task 18: BASE 87de58a
Task 18: implementer DONE_WITH_CONCERNS (commit 994a1f6; nothing-stocked.test.ts import repointed); review dispatched (sonnet)
Task 18: review approved-with-Important — no runtime cap on plan.skus (schema max(4) is advisory only); DECISION comment overstates what the old matcher checked
Ruling: Task 18 Important (plan-mandated) — enforce the declared max 4 and dedupe in browseRecorded (turn-plan-record.ts) as bad_arguments with max_skus:4, the same seam draftOf uses; fix round 1 on the Task 18 implementer — cost if wrong: one collector test.
Task 18: fix round 1/5 dispatched (resume sonnet implementer)
Task 18: fix round 1 implemented (commit fb03b0e); scoped re-review dispatched (sonnet)
Task 18: fix round 1/5 (2 addressed, 0 open — MAX_BROWSE_SKUS enforced at collector + dedupe; comment; commits 994a1f6..fb03b0e)
Task 18: complete (commits 87de58a..fb03b0e, review clean after 1 fix round)
Task 19: BASE fb03b0e
Task 19: implementer DONE_WITH_CONCERNS (commit acb278f; dispatch-parts.ts fixture split; concern: repropose closure run id urn:covenant:pick:<ref> vs tap path uuid); review dispatched (opus)
Task 19: review approved (0/0); minors (deferred): unknown-ref ask branch drops a separately-filled reply (brief-verbatim; sibling park branch keeps it); no test for empty-reply unknown-ref; plan.ref ?? '' sentinel implicit
Task 19: complete (commits fb03b0e..acb278f, review clean)
Task 20: BASE acb278f
Task 20: implementer DONE_WITH_CONCERNS (commit abd20a3; judge session gone; draft_intent without a held draft now fails the run); review dispatched (opus)
Task 20: review approved; Important: drafter schema still uses ceilingFor(stated) while collector checks operator cap → a 5000 proposal after 'under 4000' passes the collector and aborts in the judge
Ruling: Task 20 Important is transient — Task 21 deletes ceilingFor from intent-drafter.ts so schema and collector both use the operator cap; Task 21's dispatch carries a check that the two caps agree — cost if wrong: one abort path between two consecutive commits.
Task 20: minors (deferred): description.slice(0,400) duplicates the schema max (brief-verbatim); rejects.toThrow() without matcher; abort() puts cause.message into the outcome detail (confirm UI does not render it); drafter-refusal.test.ts header stale
Task 20: complete (commits acb278f..abd20a3, review clean)
Task 21: BASE abd20a3
Task 21: implementer DONE (commit 6b5b80d; caps-agree test added); review dispatched (sonnet)
Task 21: review approved (0/0); minor (deferred): scripted-reading.ts keeps stated-refund's old leading doc comment above REFUND_PHRASES
Task 21: complete (commits abd20a3..6b5b80d, review clean)
Task 22: BASE 6b5b80d
Task 22: complete (verification only, no commits; whole-repo vitest 2881 passed/0 failed; depcruise clean; sweeps empty)
STAGE 3 COMPLETE at 6b5b80d
Task 23: BASE 6b5b80d
Task 23: implementer DONE (commit e5fe714); review dispatched (sonnet)
Task 23: review approved (0/0); minors (deferred): empty-set test omits the default clock line; no test for signedIn:true/asksCode:false
Task 23: complete (commits 6b5b80d..e5fe714, review clean)
Task 24: BASE e5fe714
Task 24: implementer DONE_WITH_CONCERNS (commit 3d717dc; new errand-afterword.test.ts; sayOnly does not reset on failure per brief); review dispatched (opus)
Task 24: review approved-with-Importants — (1) prompts.summarise() evaluated outside any guard in abandoned() so a throwing summarise rejects runErrand; (2) sayOnly leak at Task 26's two call sites (no reset before a sayOnly that does not follow a runErrand)
Ruling: Task 24 (1) fixed now in fix round 1 (guard the summarise evaluation; told='' on throw); (2) carried into Task 26's dispatch: reset the pick session before afterword()/say() when not preceded by runErrand — cost if wrong: one test each.
Task 24: minors (deferred): worst-case turn wall time now ceiling+min(ceiling,30s); the ended literal in runErrand is unannotated
Task 24: fix round 1/5 dispatched (resume opus implementer)
Task 24: fix round 1 implemented (commit 6259775); scoped re-review dispatched (sonnet)
Task 24: fix round 1/5 (1 addressed, 0 open — afterword prompt build guarded; commits 3d717dc..6259775)
Task 24: complete (commits e5fe714..6259775, review clean after 1 fix round)
Task 25: BASE 6259775
Task 25: implementer DONE_WITH_CONCERNS (commit 21fcb56; SUMMARISE prompt still claims a harness note exists; anti-hallucination now by data not by drop); review dispatched (opus)
Task 25: review NEEDS FIXES — Important: web-summary.ts:56-58 SUMMARISE tells the model the screen carries 'the harness's note that these are unsigned page prices' (deleted by this task); minors (deferred): stale why-comment at :35-37 (same edit); settleLook cohesion drift; no test now fails if a fabricated page price reaches the screen (by design, §6.3) — carry to live-run checklist; a look inheriting carted:true prints the basket line without the item name
Task 25: fix round 1/5 dispatched (resume opus implementer)
Task 25: fix round 1 implemented (commit 527128d); scoped re-review dispatched (sonnet)
Task 25: fix round 1/5 (1 addressed, 0 open — SUMMARISE points at the card; commits 21fcb56..527128d)
Task 25: complete (commits 6259775..527128d, review clean after 1 fix round)
Task 26: BASE 527128d
Task 26: implementer DONE_WITH_CONCERNS (commit 57e54c9; say-helpers in pick-facts.ts; web-pick-shut.test.ts; failed-open failure text not surfaced by clockLine); review dispatched (opus)
Task 26: review approved-with-Importants — (1) web-pick.test.ts double violates SandboxOpener (no theirs()), the ?. guard in web-buy-step.ts hides it, pickFacts's 'shopper' branch untested, fallthrough asserts agent ownership from ignorance; (2) stillTheirs uses emptyFacts and misreports filled/signedIn/asksCode/handedOver
Ruling: Task 26 (1) fix: double satisfies SandboxOpener, guard dropped, 'shopper' branch tested through pickFacts; (2) fix (overrides the brief's Step 6): stillTheirs builds facts from progress via factsFrom with window forced to 'shopper'; the test asserts the truthful windowLine — the honesty block must not guess — cost if wrong: one test each.
Task 26: minors (deferred): pickAfterword sends full PICK_SUMMARY (address-confirm instruction) on a reset session with no page — only the 'if no address is visible' clause guards a fabricated address; resumeErrandFor observed param unused until Task 27; resume-path reset untested
Task 26: fix round 1/5 dispatched (resume opus implementer)
Task 26: fix round 1 implemented (commit f76418b); scoped re-review dispatched (sonnet)
Task 26: fix round 1/5 (2 addressed, 0 open — SandboxOpener doubles + unguarded theirs() + shopper branch tested; stillTheirs from factsFrom; commits 57e54c9..f76418b)
Task 26: complete (commits 527128d..f76418b, review clean after 1 fix round)
Task 27: BASE f76418b
Task 27: implementer DONE (commit b88fc12; resumeErrandFor now gets the observed block, built after resumeReset — filled slots lost; reviewer to judge); review dispatched (opus)
Task 27: review NEEDS FIXES — Important: resumed observed block built after resumeReset() prints 'delivery form: nothing was filled' about a form this host filled (contradicts WHY.address three lines above; could re-park on a second web_fill_address)
Ruling: Task 27 — capture progress.filled before resumeReset and pass it through factsFrom's override (window stays post-reset 'agent'); add a test on the resumed DRIVE prompt — cost if wrong: one line.
Task 27: minors (deferred): block read pre-hoc in the resume drive prompt (3 of 7 lines vacuous there — inherited from Task 26's parameter placement); emitLine duplicates spokenBy; said() helpers mean different things across web-pick.test.ts and web-address-confirm.test.ts
Task 27: fix round 1/5 dispatched (resume opus implementer)
Task 27: fix round 1 implemented (commit c0e3936); scoped re-review dispatched (sonnet)
Task 27: fix round 1/5 (1 addressed, 0 open — filled captured before resumeReset; commits b88fc12..c0e3936)
Task 27: complete (commits f76418b..c0e3936, review clean after 1 fix round)
Task 28: BASE c0e3936
Task 28: implementer DONE_WITH_CONCERNS (commit 22b149d; variant:system now ZERO in src; scripted RefusalVoice echoes REASON_HUMAN per brief; live converse rejection unguarded); review dispatched (opus)
Task 28: review NEEDS FIXES — Critical: explainRefusal awaited unguarded before refuseCart, a rejecting converse turns bounded into failed; Important: explanation runs on the tool-armed BuyerAgent loop and said.blocked is discarded; Important: every prose line emitted, not the model's final message
Ruling: Task 28 — guard the converse (warn + no lines) keeping the brief's pane order; forward said.blocked as blocked beats like RunNarrator.replayBlocked; emit only the last prose entry — cost if wrong: one test each.
Task 28: minors (deferred): scripted fake reports turns:0; test rigs cast RunnerParts so new required fields are compile-silent; audit-ui still renders variant:system (dead affordance, out of scope)
Task 28: fix round 1/5 dispatched (resume opus implementer)
Task 28: fix round 1 implemented (commit 0c1d0a3); scoped re-review dispatched (sonnet)
Ruling: Task 28 scripted RefusalVoice answers with REASON_HUMAN[code] (brief) — accepted: scripted mode has no model and the fake speaks the gateway's verdict; unreachable live — cost if wrong: one line.
Task 28: fix round 1/5 (3 addressed, 0 open — guarded explain; blocked beats forwarded; last prose entry only; commits 22b149d..0c1d0a3)
Task 28: minor (deferred): blocked beats from the refusal voice carry tool/server 'unknown' (ToolCallDecision lacks them; packages/agents change)
Task 28: complete (commits c0e3936..0c1d0a3, review clean after 1 fix round)
Task 29: BASE 0c1d0a3
Task 29: complete (sweep only, no commits; 3 greps empty/justified; 4 hits justified)
Ruling: refusal-step.ts:99 fallback human on a blocked beat is the hook's record surface (same fallback as RunNarrator.replayBlocked) and unreachable because PreToolUseHook always sets human on a refusal — deferred minor, not a fixed sentence — cost if wrong: one string.
Task 30: BASE 0c1d0a3
Task 30: complete (verification only, no commits; whole-repo vitest 2914 passed/0 failed; depcruise clean; greps empty; live smoke skipped by controller instruction)
STAGE 4 COMPLETE at 0c1d0a3 — zero fixed sentences in apps/agent-host/src
Note: pre-existing max-depth lint error lives at packages/browser-drive/src/frame/grid-overlay.ts (outside every stage's lint scope; carry to final summary)
Task 31: BASE 0c1d0a3
Task 31: implementer DONE_WITH_CONCERNS (commit 1489c25; keyedProviders doc worded via the registry — accepted; stale dist/sdk removed locally); review dispatched (opus)
Task 31: review approved-with-Importants — (1) config.ts:177 keyedProviders doc clause false at this commit (a Sarvam key alone still starts live mode); (2) GOOGLE_API_KEY-over-GEMINI_API_KEY ordering test dropped with the factory test rewrite
Ruling: Task 31 (1) fix round 1 (drop the false clause); (2) NOT restored — Task 32 deletes Gemini next; Task 33's dispatch carries a check that apiKeyEnvKeys ordering is either single-valued for openai or still tested — cost if wrong: one it().
Task 31: minors (deferred): report's per-file test arithmetic (-7 vs -6; net -17 correct); merged model-resolution cases narrowed to openai; sse-stream.ts:7 omits Gemini until Task 32; apps/agent-host keeps two local Env aliases
Task 31: fix round 1/5 dispatched (resume opus implementer)
Task 31: fix round 1 implemented (commit 1b2cb1d); scoped re-review dispatched (sonnet)
Task 31: fix round 1/5 (1 addressed, 0 open — keyedProviders doc; commits 1489c25..1b2cb1d)
Task 31: complete (commits 0c1d0a3..1b2cb1d, review clean after 1 fix round)
Task 32: BASE 1b2cb1d
Task 32: implementer DONE (commit f790568; note: provider-live smoke tests hit real OpenAI/Sarvam APIs with the workspace .env keys during vitest); review dispatched (sonnet)
Task 32: review approved (0/0); minor (deferred, FLAG TO USER): provider-live.test.ts runs real API calls on key presence alone (no opt-in flag) — pre-existing; the agent-session-factory negative test keeps the 'gemini' literal by design
Task 32: complete (commits 1b2cb1d..f790568, review clean)
Task 33: BASE f790568
Task 33: implementer DONE_WITH_CONCERNS (commit 8375af7; apiKeyEnvKeys single-valued → comment simplified; CHAT_PROVIDERS option dropped; README/ARCHITECTURE drift for Task 36; provider-live ran once); review dispatched (opus)
Task 33: review approved (0/0); minors (deferred): cost-floor-only catalogue could still empty the money ladder (pre-existing, unreachable from the manifest); stale comments in provider-live.test.ts:54 and provider-config.ts:87-89; README/ARCHITECTURE still list four providers (Task 36 / founder)
Task 33: complete (commits f790568..8375af7, review clean)
Task 34: BASE 8375af7
Task 34: implementer DONE (commit 09245ae; lockfile -783/+0); review dispatched (sonnet)
Task 34: review approved (0/0/0)
Task 34: complete (commits 8375af7..09245ae, review clean)
Task 35: BASE 09245ae
Task 35: implementer DONE (commit d57ee0b); review dispatched (sonnet)
Task 35: review approved (0/0); minor (deferred): thread.ts buildSegment/buildThread lose their rendering caller (kept per brief)
Task 35: complete (commits 09245ae..d57ee0b, review clean)
Task 36: BASE d57ee0b
Task 36: implementer DONE (commit a552976; packages/agents/src lints clean); review dispatched (sonnet)
Task 36: review approved (0/0/0)
Task 36: complete (commits d57ee0b..a552976, review clean)
Task 37: BASE a552976
Task 37: complete (verification only, no commits; whole-repo vitest 2859 passed/0 failed; eslint 3 trees clean; depcruise clean; lockfile 0; sweeps justified)
STAGE 5 COMPLETE at a552976 — ALL 37 TASKS COMPLETE
Final review: package a4cfd60..a552976 dispatched (opus)
Final review (opus): READY WITH FIXES — 0 critical; Important: (1) tracked covenant/ARCHITECTURE.md L69/246/382/429-438/524 still claims four providers and F2-via-SDK-hook; (2) turn-plan-draft.ts whitespace-only description → silent dead turn; (3) turn-planner.ts cut-off turn with only remember_trait leaks its draft as a bubble; (4) pick-step.ts unknown-ref branch drops a separately-filled reply
Ruling (CORRECTING ruling 123): ARCHITECTURE.md exists twice — ../ARCHITECTURE.md (parent dir, founder's) AND the tracked covenant/ARCHITECTURE.md; the tracked copy is updated in the fix wave — cost if wrong: prose only.
Ruling: fix wave scope = the 4 Importants + Minor #6 (clockLine editorialises) + the stale-comment sweep (ledger 190/199/278/298/343/354 + Minor #8) + Minor #11 (audit-ui empty-prompt guard, demo-visible one-liner) + Minor #12 (delete dead T1_CHAT_SCRIPT only if unimported) + Minor #13 (redundant assertion); #5/#7/#9/#10 and the live-test opt-in gate are follow-ups — cost if wrong: one re-review.
Final review: fix wave dispatched (opus) from BASE a552976
Final fix wave: commits ede1bbf (code) + 800fbc5 (prose); whole-repo vitest 2866/0; scoped re-review dispatched (opus)
Final fix wave: re-review (opus) — all 10 findings ADDRESSED, no new critical/important; READY TO MERGE at 800fbc5
Ruling: parked — a cut-off turn that had recorded an acting move now wraps up instead of acting (fail-closed toward conversation; no side effect lost) — no test pins it; follow-up — cost if wrong: one re-do turn for the shopper.
Ruling: parked — ChatSession.tsx:120,254 `question?.prompt ?? …` treats an empty-string prompt as present (audit-ui, spec §10 out of scope); follow-up nonEmpty() helper — cost if wrong: a suppressed composer fallback on a silent park.
FOLLOW-UPS (not blocking): provider-live.test.ts opt-in gate (COVENANT_LIVE_TESTS); answer-step/turn-plan-record question-dedupe predicates; read_failed detail whitelist; tool-free session for liveRefusals; ../ARCHITECTURE.md (parent dir) provider prose; web-buy-step unresolvable-ref silent turn; ARCHITECTURE.md:604 session count; live-run checklist (Hindi turn via speakFor only; browse cards by SKU; provider outage = empty turn; fabricated page price reaches screen only by the model's honesty)
PLAN COMPLETE 2026-09-03
