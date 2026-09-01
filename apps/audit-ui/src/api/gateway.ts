// §4.3 — gateway-svc REST surface the UI needs beyond the ledger stream.
// Every function asks `isLive()` first, so an unconfigured build never
// touches the network and never claims a fixture is a reading.
import { isLive } from "./liveMode.ts";
import { getJson, postJson } from "./gatewayFetch.ts";
import { mapCovenant, type RawCovenant } from "./mapCovenant.ts";
import {
  mapFoldSummary,
  mapMerchantTrust,
  mapPricePoints,
  type RawFoldSummary,
  type RawMerchantTrust,
  type RawPricePoint,
} from "./mapFolds.ts";
import * as fixtures from "./fixtureData.ts";
import type {
  CovenantSnapshot,
  FoldSummary,
  HealthChecks,
  LedgerHead,
  MerchantTrustEntry,
  PricePoint,
  ReadyzResponse,
  ReplayResult,
  VerifyResult,
} from "./types.ts";

/**
 * One route still has no browser-side mapping, and it is the right one to
 * refuse: `/v1/covenant/sign` wants an ES256 signature over the canonical
 * base string, and the browser holds no user key.
 */
function unmapped<T>(path: string): Promise<T> {
  return Promise.reject(
    new Error(`${path}: gateway shape is not mapped to a UI view type yet`),
  );
}

interface RawReadyz {
  ok: boolean;
  checks: {
    ledger_open: boolean;
    jwks_loaded: number;
    rzp_reachable: boolean;
  };
}

/** `jwks_loaded` is a role count on the wire; the chip wants "any ring at all". */
function checksOf(raw: RawReadyz): HealthChecks {
  return {
    ledgerOpen: raw.checks.ledger_open,
    jwksLoaded: raw.checks.jwks_loaded > 0,
    rzpReachable: raw.checks.rzp_reachable,
  };
}

export async function fetchReadyz(): Promise<ReadyzResponse> {
  if (!isLive()) return fixtures.readyzResponse();
  // `/readyz` is deliberately outside the `/v1` header gate: it is the probe
  // Docker and the chip both poll, and a version pin on liveness is a way to
  // report "unhealthy" for a header mistake.
  const raw = await getJson<RawReadyz>("/readyz");
  return { ready: raw.ok, checks: checksOf(raw) };
}

export async function fetchLedgerHead(): Promise<LedgerHead> {
  if (!isLive()) return fixtures.ledgerHead();
  const raw = await getJson<{ height: number; head_hash: string | null }>(
    "/v1/ledger/head",
  );
  return { height: raw.height, headHash: raw.head_hash ?? "" };
}

export async function fetchCovenant(): Promise<CovenantSnapshot> {
  if (!isLive()) return fixtures.covenantSnapshot();
  return mapCovenant(await getJson<RawCovenant>("/v1/covenant"));
}

export function signCovenant(
  intentMandateJwt: string,
): Promise<{ ok: boolean }> {
  if (!isLive()) return Promise.resolve({ ok: true });
  // The gateway demands an ES256 signature over the canonical base string on
  // this route; the browser holds no user key, so the host signs it, not us.
  return unmapped(
    `/v1/covenant/sign (${intentMandateJwt.length}-char JWT) — the signing key lives in agent-host`,
  );
}

export function cancelCooloff(id: string): Promise<{ ok: boolean }> {
  if (!isLive()) return Promise.resolve({ ok: true });
  return postJson(`/v1/cooloff/${id}/cancel`);
}

export function restoreCooloff(id: string): Promise<{ ok: boolean }> {
  if (!isLive()) return Promise.resolve({ ok: true });
  return postJson(`/v1/cooloff/${id}/restore`);
}

export async function fetchFoldSummary(): Promise<FoldSummary> {
  if (!isLive()) return fixtures.foldSummary();
  return mapFoldSummary(await getJson<RawFoldSummary>("/v1/folds/summary"));
}

export async function fetchMerchantTrust(): Promise<MerchantTrustEntry[]> {
  if (!isLive()) return fixtures.merchantTrust();
  return mapMerchantTrust(
    await getJson<RawMerchantTrust[]>("/v1/folds/merchants"),
  );
}

export async function fetchPriceHistory(sku: string): Promise<PricePoint[]> {
  if (!isLive()) return fixtures.priceHistory(sku);
  const raw = await getJson<{ points: readonly RawPricePoint[] }>(
    `/v1/folds/prices/${encodeURIComponent(sku)}`,
  );
  return mapPricePoints(raw.points);
}

export function verifyLedger(): Promise<VerifyResult> {
  return isLive()
    ? postJson<VerifyResult>("/v1/ledger/verify")
    : Promise.resolve(fixtures.verifyResult());
}

interface RawReplay {
  ok: boolean;
  live_state_hash: string;
  replayed_state_hash: string;
  events: number;
  ms: number;
}

export async function replayLedger(): Promise<ReplayResult> {
  if (!isLive()) return fixtures.replayResult();
  const raw = await postJson<RawReplay>("/v1/ledger/replay");
  return {
    ok: raw.ok,
    liveStateHash: raw.live_state_hash,
    replayedStateHash: raw.replayed_state_hash,
    events: raw.events,
    ms: raw.ms,
  };
}
