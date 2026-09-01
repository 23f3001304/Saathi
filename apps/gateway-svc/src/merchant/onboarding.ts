import type {
  ItemCatalog,
  MerchantItem,
  NewMerchantItem,
} from "@covenant/domain";
import { DomainError } from "@covenant/domain";
import type { Enrolment, TrustRing } from "@covenant/mandates";
import { enrolIssuer } from "@covenant/mandates";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SLUG_MAX = 48;

export interface MerchantProfile {
  readonly slug: string;
  readonly displayName: string;
  readonly items: readonly NewMerchantItem[];
}

export interface OnboardedMerchant {
  readonly slug: string;
  readonly displayName: string;
  readonly issuer: string;
  readonly kid: string;
  readonly notAfter: string;
  readonly ring: TrustRing;
  readonly privateKeyJwk: Readonly<Record<string, string>>;
  readonly items: readonly MerchantItem[];
}

/** The issuer URN a merchant is known by, derived from the slug and nothing else. */
export function merchantIssuerOf(slug: string): string {
  if (!SLUG_PATTERN.test(slug) || slug.length > SLUG_MAX) {
    throw new DomainError("SCHEMA_VIOLATION");
  }
  return `urn:covenant:merchant:${slug}`;
}

/**
 * What onboarding a merchant into Covenant actually is.
 *
 * Razorpay Route linked accounts are not enabled on this key — `GET /v2/accounts`
 * answers 404 — so this cannot create a sub-merchant or a payout destination,
 * and it does not pretend to. What it *can* do is the half that is Covenant's
 * and that matters more: a merchant whose quotes nobody can verify is a
 * merchant whose prices are gossip. So onboarding mints an ES256 keypair, puts
 * its public half in the pinned trust ring under the merchant's own URN, and
 * publishes their opening catalog as real Razorpay items.
 *
 * DECISION: this is a function a composition root calls, never an HTTP route.
 * Why: enrolling a key into the trust ring *is* granting authority, and a route
 * that mints one on request is a merchant granting itself the right to be
 * believed. The operator running the process holds that decision.
 *
 * The returned ring is not written here either. The caller writes it, and the
 * running gateway will not see the new kid until it is restarted — the ring is
 * read once, at boot, and never fetched (§6.7 rule 1).
 */
export async function onboardMerchant(
  ring: TrustRing,
  profile: MerchantProfile,
  items: ItemCatalog | null,
  now: Date,
): Promise<OnboardedMerchant> {
  const enrolment = await enrolIssuer(
    ring,
    merchantIssuerOf(profile.slug),
    "merchant",
    now,
  );
  return {
    ...identityOf(enrolment, profile),
    items: await publish(items, profile.items),
  };
}

function identityOf(enrolment: Enrolment, profile: MerchantProfile) {
  return {
    slug: profile.slug,
    displayName: profile.displayName,
    issuer: enrolment.issuer,
    kid: enrolment.kid,
    notAfter: enrolment.notAfter,
    ring: enrolment.ring,
    privateKeyJwk: enrolment.privateKey.jwk,
  };
}

/**
 * Items are created one at a time and in order, not in parallel: a half-created
 * catalog is real state in someone's Razorpay account, and a failure that names
 * which item it stopped at is worth more than a fast one that does not.
 */
async function publish(
  catalog: ItemCatalog | null,
  drafts: readonly NewMerchantItem[],
): Promise<readonly MerchantItem[]> {
  if (catalog === null) {
    return [];
  }
  const created: MerchantItem[] = [];
  for (const draft of drafts) {
    created.push(await catalog.createItem(draft));
  }
  return created;
}
