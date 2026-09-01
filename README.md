# Covenant

**An agent that shops for you, and cannot spend your money except through a signed mandate it can prove you authorised.**

Every rupee moves under an [AP2](https://github.com/google-agentic-commerce/AP2) mandate chain — Intent → Cart → Payment — issued as W3C Verifiable Credentials and recorded in a hash-chained, replayable ledger. The novel part is what gates that chain: **Provenance-Tiered Ledger Memory (PTLM)**. Every remembered fact carries a provenance tier, and only facts the user actually signed can justify spending. A price the merchant asserted in prose is quarantined at P0; it can inform, and it can never widen a bound.

That is the whole thesis in one sentence: **the model decides what to do, the covenant decides what is allowed, and neither can quietly become the other.**

Architecture of record: [`ARCHITECTURE.md`](ARCHITECTURE.md). Design docs: [`docs/`](docs/).

---

## What this actually does

You say _"a navy kurta under ₹2,000, refundable."_ Then:

1. The agent drafts an **Intent Mandate** — a ceiling, a category, a refundability requirement, an expiry. You hold a button for 600 ms to sign it. Nothing has been searched for yet.
2. It shops. Listing copy is a claim, not a price: no number is treated as real until it arrives **merchant-signed**.
3. Every fact it learns is written to memory **at a tier**. A claim read off a page is quarantined at P0. The gateway's write gate, not the agent, decides what tier a memory is granted.
4. It builds a cart. The **memory digest** — a hash of exactly which memories justified this purchase — is signed into the Cart Mandate. You cannot swap the reasoning after the fact without breaking the signature.
5. Eight independent checks run before a single paisa moves: mandate chain, envelope, cool-off, provenance entitlement, nonce, quote freshness, refundability, cap. Each returns `pass | hold | fail` with a reason code and a remedy.
6. You sign the cart. Only then does the gateway call Razorpay.

Along the way you will see it **refuse things**. The merchant's MCP server offers a tool called `execute_payment`; the agent tries it, and the harness blocks the call before it runs — _money leaves only through the covenant gateway_. That refusal is not a demo script; it is a policy the agent cannot talk its way past.

---

## Run it

Prerequisites: Node 24+, pnpm 10+.

```bash
pnpm install
pnpm build
```

Copy `.env.example` to `.env` and add Razorpay **test-mode** keys. With no keys the gateway runs a fake rail and the agent runs a scripted session — the whole system still boots and demonstrates itself, which is deliberate: a judge cloning this repo without credentials should see the architecture, not a stack trace.

```bash
node --env-file=.env apps/gateway-svc/dist/src/index.js
```

```bash
node --env-file=.env apps/agent-host/dist/src/index.js
```

```bash
pnpm --filter @covenant/audit-ui dev
```

```bash
pnpm --filter @covenant/merchant-ui dev
```

- Gateway: <http://localhost:8787> — `/readyz` reports ledger, chain head, JWKS, folds, rail
- Agent host: <http://localhost:8788>
- Shopper: <http://localhost:5173>
- Merchant: <http://localhost:5174>

**Two applications, deliberately.** The shopper's agent is bounded by a covenant
and spends money. The merchant's agent has no covenant, signs no mandate and
moves nothing — it answers the only question a seller actually has, _why am I
not being picked by AI buyers?_, out of folds the ledger already computes:
trust, unmet demand, leakage, and an audit of the merchant's own listing copy
against the eight dark patterns. A shopper and a shopkeeper do not want the
same software.

Onboard a merchant — mints their signing key into the trust ring and publishes
their catalogue as real Razorpay items:

```bash
pnpm --filter @covenant/gateway-svc merchant:onboard profile.json
```

The trust ring is read once at boot, so a merchant enrolled after the gateway
started is invisible until it restarts, and their quotes read as
`SIGNER_UNKNOWN` until then. The CLI says so.

gateway-svc mints a dev trust ring into `keys/` on first boot. Start it before agent-host, which loads that ring rather than minting its own.

Set `COVENANT_AGENT_MODE=live` to drive the agent with a real model. It needs **one** provider key — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` or `SARVAM_API_KEY` — and routes among whichever are present. Unset, it runs a deterministic scripted session that exercises the same block matrix.

`pnpm docker:up` brings up the same stack plus Jaeger on <http://localhost:16686>.

---

## Layout

```
packages/domain        entities, value objects, ports          depends on NOTHING
packages/ledger        event store, hash chain, deterministic fold
packages/memory        PTLM: tiers, write gate, digest, bi-temporal validity
packages/mandates      VC issue/verify, JWKS trust ring, nonce registry
packages/gateway       the eight-check verdict engine
packages/razorpay      PaymentRail adapter, Razorpay test-mode REST
packages/agents        buyer + merchant agents, provider routing
packages/recs          flywheel folds, k-anonymised recommendations
packages/browser-drive sandboxed Chrome, field classifier, frame redaction
apps/gateway-svc       composition root — the only path to money
apps/agent-host        the agent loop, beat stream, browser service
apps/audit-ui          the shopper: conversation, rules, ledger
apps/merchant-ui       the seller: standing, demand, leakage, listing audit
tools/attacks          T-1 / T-27 / T-31 harness — HTTP only, imports nothing
```

The arrows are not documentation. They are `.dependency-cruiser.cjs` rules and TypeScript project references, and they fail the build when violated. `packages/agents` cannot import `packages/razorpay`; the agent layer has no path to a payment rail even by accident.

---

## The parts worth looking at

**The write gate** (`packages/memory`) — where a memory's claimed tier meets the rule table. A `constraint` requires P3. Contradiction rules R1–R5 refuse a memory that would widen a bound it is not entitled to widen. Constraints are derived from the real signed intent by the same call the signing route makes, so a memory cannot be evaluated against a different covenant than the one in force.

**The verdict engine** (`packages/gateway`) — eight checks, each an independent strategy with its own reason code and remedy. A `hold` is not a failure: a cool-off returns when it will execute and how to cancel it.

**The ledger** (`packages/ledger`) — append-only, hash-chained, single-writer under `BEGIN IMMEDIATE`. State is a deterministic fold over events, so `POST /v1/ledger/replay` rebuilds it from zero and compares state hashes. If replay diverges, the system says so.

**The browser sandbox** (`packages/browser-drive`) — a disposable Chrome profile driven over `--remote-debugging-pipe`, never `--no-sandbox`. Password and card fields are classified, and their pixels are painted opaque **in the PNG bytes** before a frame ever leaves the process — not a CSS overlay a page could refuse to render. The agent cannot type a credential; control moves visibly to you, and back.

**The dark-pattern shield** (`packages/memory/src/manipulation`) — eight named
patterns (scarcity, urgency, false anchoring, drip pricing, confirmshaming,
preselection, social proof, obstruction), each with the bias it exploits and
the concrete counter. Deterministic, below the model: the agent's resistance to
a countdown timer must not depend on the agent noticing the countdown timer,
because a shield you can argue with is not one. The same detector runs on the
merchant dashboard, so a seller sees exactly what buyer agents will flag.

**The attack harness** (`tools/attacks`) — black-box, HTTP only, imports nothing from the packages it attacks. T-1 is pre-signing context poisoning: text that tries to raise a ceiling between drafting and signing.

---

## Gates

| Command          | What it enforces                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`      | `max-lines` 200, `max-lines-per-function` 40, `complexity` 8, `max-depth` 3, no `any` — all errors, `--max-warnings 0` |
| `pnpm depcruise` | no cycles, no package importing `apps/`, per-package import allowlists                                                 |
| `pnpm test`      | Vitest, one project per package                                                                                        |
| `pnpm build`     | `tsc -b` across the composite graph                                                                                    |

```bash
git config core.hooksPath .hooks
```

`.hooks/pre-commit` runs lint, depcruise and test — the same three commands CI runs, so local and CI cannot drift.

---

## Honest limits

- The merchant is a local MCP server with a small catalog. Shopping a real storefront is the browser sandbox's job, and the buyer agent's tool calls are not yet routed through it.
- `sqlite-vec` is optional; without it, semantic memory recall falls back to lexical search and `/readyz` says so.
- Payment capture is Razorpay test mode. No real money can move through these keys.
- `/browser/*` on agent-host is unauthenticated with `origin: "*"`, like the rest of that app. Fine on a demo machine, not fine deployed.
- Sandbox frames are redacted by *painting*: while the agent drives, every sensitive rectangle is filled opaque in the PNG bytes before the frame leaves the process. The pixels are therefore read into agent-host and then covered, rather than never captured — an earlier build stopped the shutter entirely on a focused protected field, and that was reversed because stopping latched the stream shut and because a card that goes black at the payment step is unusable. While *you* drive, the window is shown unmasked (the card says so on screen): the person watching the stream is the person typing, and the frames cross agent-host's memory on localhost to your own tab. No frame is ever persisted — the conversation log stores the action list and no picture.
