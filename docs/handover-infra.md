# Handover: warm sandbox pool, parallelism, Oracle Cloud

You are picking up **Covenant / "Saathi"** — a hardened agentic checkout built
for the Razorpay AI Buildathon (Track 01). A demo video is due shortly, so the
work must be real but must not destabilise a working demo path.

Repo: `C:\Users\coehe\Razorpay\covenant` · branch `master` · at `e88f5f5`.

## Run it

```bash
node --env-file=.env apps/gateway-svc/dist/src/index.js   # :8787
node --env-file=.env apps/agent-host/dist/src/index.js    # :8788
cd apps/audit-ui && npm run dev                           # :5173
```

Docker Desktop must be running: purchase windows are containers and there is
no fallback (`apps/agent-host/src/browser/sandbox-plan.ts`). The image is
`covenant-browser-sandbox:latest`, built by `docker compose build
browser-sandbox`.

Gates that must stay green, all four, every time:

```bash
npx tsc -b && npx eslint . --max-warnings 0 && npx depcruise apps packages tools && npx vitest run
```

Current: 3001 passing, 6 skipped (the real-Chrome fixture suite skips under
containers — see "Known gaps").

## House rules

- SOLID, one idea per file, **max 200 lines/file, 40 lines/function,
  complexity 8** — eslint enforces all of it.
- Comments explain *why*, especially where a decision looks odd. Mark real
  ones `DECISION:`.
- **No em dashes** in any user-visible copy.
- No new dependencies without a stated reason.
- **LLM-native is the product philosophy**, stated repeatedly and emphatically
  by the founder: the model gets *tools* to see and act on the platform; the
  shell does not sniff its prose, filter its output, or script its sentences.
  Prompts say who the agent is and what it must not do, never what shape its
  sentences take. Format belongs in a tool schema and nowhere else.

## What must not regress (the product's whole point)

- `FieldClassifier` judges every click and keystroke, whether aimed by
  selector or by coordinate. **Aim is free; aim is not permission.**
- The agent never presses pay, never solves a human check, never sees a
  credential. `web_sign_in` types the stored sign-in host-side and returns
  nothing; the journal records `{protected: true}` and not one character.
- Hold-to-sign gates, the mandate chain, and the gateway's checks.
- Containers mount nothing from the host (`FORBIDDEN_CONTAINER_ARGS` in
  `packages/browser-drive/src/container/docker-args.ts`) — deliberate, and the
  reason the fixture suite skips.

## Ask 1 — an always-warm sandbox, no cold start

Every window is launched on demand today and reaped after 120s idle
(`IDLE_GRACE_MS`, `apps/agent-host/src/browser/idle-watch.ts`), so the first
action of a run pays full container plus Chrome start. The founder wants a
shared, always-live sandbox so there is no cold-start wait.

Constraints to respect:

- Profiles are **per conversation and persistent** (`PersistentSandboxFactory`,
  keyed by `windowIdFor(conversation)` in
  `apps/agent-host/src/browser/sandbox-factory.ts`). Cookies and the stored
  sign-in live there; a shared warm container must never blend two shoppers.
- A sensible shape: a small pool of pre-launched, profile-less containers,
  bound to a conversation on first use, rather than one browser for everyone.
- `BrowserRegistry` (`browser-registry.ts`) already owns capacity, a queue and
  eviction. The pool belongs there or beside it, not sprinkled through callers.
- Research reads (`HeadlessReader`) are a separate browser from the purchase
  window and already batch 5 pages in parallel. A warm reader is the cheaper
  half of this and worth doing first.

## Ask 2 — parallelism and microservices for sandbox control

Parallel today: lanes (one per conversation, capped) and
`HeadlessReader.readMany`. Strictly serial: everything inside one errand — each
tool call awaits the last, and research to verify to card is a chain.

Directions worth taking:

- Let a turn issue **concurrent tool calls** and have the runner fan them out.
  This touches `provider-turn-loop`, the step pills, and the errand deadline
  (`ERRAND_CEILING_MS`, now 600s), so it needs care rather than speed.
- Extract **sandbox control into its own service** (launch, drive, capture)
  behind the ports already defined in `packages/browser-drive/src/ports.ts`.
  The boundary is clean and the container launcher already talks over a pipe
  (`pipe-transport.ts`), so a network transport is a sibling, not a rewrite.
- One rule survives any topology: the classifier and the state machine judge on
  the **sandbox side**, never on the caller's word.

## Ask 3 — host it on Oracle Cloud (free tier)

Target: Oracle always-free (typically 4 ARM cores / 24 GB). Three processes
plus per-session Chrome containers.

What will bite, in order:

1. **ARM**: the sandbox image must build for arm64 — check the Chrome and
   Puppeteer base in the sandbox Dockerfile.
2. **Memory**: `session-capacity.ts` derives the window cap from
   `COVENANT_DOCKER_MEM_MB` at 1024 MiB per container. Size the cap
   deliberately rather than letting it guess.
3. **Secrets**: `.env` holds a live `OPENAI_API_KEY` and is gitignored. **The
   key must be rotated before anything is published**, and on the box it should
   come from the environment, not a file in the repo.
4. `data/` holds the ledger DB, the credential vault and the sandbox profiles,
   so it needs a real volume. The vault is plaintext today, a stated demo
   tradeoff worth revisiting.
5. `COVENANT_UI_ORIGINS` gates CORS, and the UI should be built
   (`npm run build`) and served rather than run under Vite dev.

## How the founder wants to be worked with

- Move fast, but make no illogical sacrifices. Correct beats quick, and "quick"
  is never a reason to fake something.
- Do not stack shell-side filters or canned sentences to paper over model
  behaviour. If the model behaves badly, the prompt or the tools are wrong.
- Verify against the running app, not only the suite, and say plainly what is
  verified versus what is merely compiled.

## Known gaps, to be honest about

- The real-Chrome fixture suite (6 tests) skips under containers because
  `file://` fixtures live on the host. Serving them over the container bridge
  is the way back.
- `mouse` and `keyboard` (the coordinate-driven devices) and the on-screen
  point fix landed in `e88f5f5` and have **not been driven end to end live**.
  Worth one tap-through before building on top of them.
- The vault sign-in, the OTP ask and the address-confirm step are wired and
  unit-tested but have never completed against a real Amazon checkout.
