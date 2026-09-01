import type { JSX } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider.tsx";
import { Desk } from "./chrome/Desk.tsx";
import { useTrustRing } from "./data/useShopData.ts";
import { ChooseShop } from "./screens/ChooseShop.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import type { IdentityFactory } from "./auth/types.ts";

/**
 * The shopkeeper's app. It has no covenant, signs no mandate and moves no
 * money — the only thing it signs is a change to its own inventory. What it
 * answers is the question a shop actually has: why am I not being picked?
 *
 * Three gates, in order, and each one honest about what it does. Sign-in says
 * who is at the keyboard. Choosing a shop says whose books to open, and opens
 * nothing that was not already public. Neither of them can change a listing;
 * that asks a signing key, which lives on the merchant's own device.
 */
function Console(): JSX.Element {
  const { status, shop } = useAuth();
  if (status === "signed-out") return <SignIn />;
  if (shop === null) return <ChooseShop />;
  return <Desk shop={shop} />;
}

export function App({
  identityFactory,
}: {
  /** Injected in tests; production picks Google or the labelled demo path. */
  identityFactory?: IdentityFactory;
}): JSX.Element {
  const ring = useTrustRing();
  return (
    <AuthProvider
      ring={ring.shops}
      ringLoaded={ring.loaded}
      identityFactory={identityFactory}
    >
      <Console />
    </AuthProvider>
  );
}
