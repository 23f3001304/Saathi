# OpenAI-only providers, Sarvam for speech, stale files out

Date: 2026-09-02. Scope: `packages/agents/src/{providers,sdk,routing}`, `apps/agent-host/src/{config,wiring}`, `apps/audit-ui/src` (orphans only), two `package.json`s. Status: approved in chat; lands as Stage 5 (Tasks 31–37) of `docs/superpowers/plans/2026-09-02-llm-native-turn-engine.md`, after Stages 1–4.

## 1. Goal

One chat provider. Every sentence a shopper reads, every plan the planner records and every draft the sheet shows comes from **OpenAI on the Responses API**. The Claude (Anthropic Agent SDK) and Gemini adapters, the Sarvam *chat* adapter, their registry entries, routing families, discovery endpoints, dependencies and tests are removed. **Sarvam stays for speech only**: `saaras` listens and `bulbul` speaks in `apps/audit-ui/src/voice`, which needs nothing from `packages/agents`. Source files nothing imports are removed with them.

## 2. Keep / remove

| Area | Remove | Keep |
|---|---|---|
| Registry `providers/provider-config.ts` | `claude`, `gemini`, `sarvam` specs; `DEFAULT_AGENT_PROVIDER = "claude"` | `AGENT_PROVIDERS = ["openai"]`; `Env`, `MODEL_ENV_KEY`, `DEFAULT_AGENT_MODEL` (moved here from `sdk/model.ts`) |
| SDK path `packages/agents/src/sdk/` | whole directory: `claude-agent-session.ts`, `claude-stream.ts`, `model.ts`, `sdk-hooks.ts`, `sdk-tools.ts` | `parseSdkToolName` → `parseWireToolName` in `providers/tool-declarations.ts`; the `mcp__<server>__<tool>` wire name is the convention every adapter declares and reads back |
| Adapters | `gemini-agent-session.ts`, `sarvam-agent-session.ts`, `chat-completions-session.ts`, `chat-completions-stream.ts` (Sarvam was their only user) | `openai-agent-session.ts`, `openai-stream.ts`, `provider-transport.ts`, `provider-turn-loop.ts`, `guarded-tool-dispatcher.ts`, `repeat-guard.ts`, `spoken-arguments.ts`, `sse-stream.ts`, `turn-stream.ts`, `attempt-drafts.ts`, `wire-json.ts` |
| Factory `agent-session-factory.ts` | `ClaudeSessionOverrides`, `claudeSession()`, the gemini/sarvam branches, `requireApiKey` (a CLI-login escape only Claude had), `guard: null` | `createAgentSession` builds one `OpenAiAgentSession`; `hostedWebSearch` → `hostedTools: [{type:"web_search"}]`; `guard` is always a `GuardedToolDispatcher` |
| Routing | `claude`/`gemini`/`sarvam` families, discovery endpoints and manifest rows; `INDIC_BONUS`; the `indic` capability flag and requirement; the `indic_chat` class; `TaskFeatures.script`, `scriptOf`, `INDIC_BLOCKS`, `ROMANISED_MARKERS`; `LadderRequest.features` | the cascade itself: `ModelRouter`, ladder, confidence, stats, discovery cache, audit; the Devanagari settlement/negotiation markers (they size tool depth, not script) |
| agent-host wiring | `claudeOverrides`, `RouterDeps.claude`, `CHAT_PROVIDERS` | `routedSession`, `wireModelRouter` (the pool is the registry) |
| Config | nothing in code; the "requiring Anthropic" comment | `LIVE_PROVIDER_KEYS`/`keyedProviders` derive from the registry: live mode now needs `OPENAI_API_KEY`; `SARVAM_API_KEY` alone is refused |
| Dependencies | `@anthropic-ai/claude-agent-sdk` (agents + agent-host), `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk` (agents devDeps) | everything else; no Google package ever existed |
| Stale sources | `merchant/rzp-mcp-mount.ts` (never instantiated), `BUYER_PROMPT_VERSION`, audit-ui `chrome/RailNav.tsx`, `conversation/Conversation.tsx`, `covenant/ConstraintList.tsx`, `instrument/TxnRail.tsx`, `kolam/KolamThread.tsx`, `motion/useReplay.ts`, `primitives/Rule.tsx` (+ their `.module.css`), merchant-ui's Sarvam CSP entry and design comment | see §4 |
| Docs | Dockerfile comment, `README.md` key list, `docs/backend-architecture.md` "Claude Agent SDK" lines and the two `RazorpayMcpMount` rows | `ARCHITECTURE.md` at the repo parent is the submission document and is edited by the founder, not here |

## 3. F2 after the SDK is gone

`PreToolUseHook` is unchanged. It is applied in exactly one place: `GuardedToolDispatcher.dispatch`, which `runGuardedTurn` calls for every tool request the model emits, and which `BuyerAgent.runOne` mirrors for the harness-driven loop. The adapter takes a `GuardedToolDispatcher`, never a bare `ToolDispatcher`, so there is no constructor that builds a session with the gate missing. The block matrix the tests prove (`provider-adapters.test.ts`, `turn-unfinished.test.ts`) is the one that runs live. The "Agent SDK PreToolUse interception" hook named in the engineering rules is this same class on the HTTP loop; nothing about what is refused changes.

## 4. Flagged, not done (by decision)

- `apps/audit-ui/src/voice/turnEnd.ts` calls a Sarvam chat-completions model (`sarvam-105b-conversations`) from the browser to decide whether the shopper has finished speaking. It is turn-end detection inside the speech pipeline, not reasoning or output: **kept**.
- `apps/audit-ui/src/conversation/AmendmentProposals.tsx` is the only renderer of amendment proposals and nothing mounts it. That is an unwired feature, not a stale file: **kept**, flagged for the UI.
- `apps/audit-ui/src/video/TitleCard.tsx` (video capture tool, self-documented as standalone) and `apps/landing/src/kolam/Seal.tsx` (founder-KEEP per `App.tsx`): **kept by intent**.
- `apps/audit-ui/src/voice/**` and its `VITE_SARVAM_API_KEY` flow: untouched.
- The routing classifier's word lists (`task-features.ts`) stay: they choose a model tier, never a sentence (spec §3 of the turn-engine design).

## 5. Verification

After Task 37: `pnpm exec tsc -b`, `pnpm exec eslint packages/agents/src apps/agent-host/src apps/audit-ui/src --max-warnings 0` (the pre-existing `openai-agent-session.ts` max-lines error is fixed by splitting its request builder out), `pnpm depcruise`, `pnpm exec vitest run` green; `grep -c "anthropic\|modelcontextprotocol" pnpm-lock.yaml` → 0; a repo-wide grep for `anthropic|claude-agent-sdk|Gemini|Sarvam.*Session|ClaudeSessionOverrides|merchantMcpServer|RazorpayMcpMount` in `packages/` and `apps/` (ts/tsx/json/mjs, excluding `dist/` and `node_modules/`) hits only the two UI-pattern comments in `assistantSnapshot.ts` / `Composer.tsx` and the voice directory.
