// §1.3 — route shell: persistent chrome (top bar, rail, dock) plus the
// three routes and the two shared overlays (O1 signing, O2 digest).
import { useEffect, useRef, useState, type JSX } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider.tsx";
import type { AuthStatus } from "./auth/types.ts";
import { useRoute } from "./router/useRoute.ts";
import { SignIn } from "./screens/SignIn.tsx";
import { SignInKey } from "./screens/SignInKey.tsx";
import { TopBar } from "./chrome/TopBar.tsx";
import { RefusalsSheet } from "./chrome/RefusalsSheet.tsx";
import type { HealthState } from "./chrome/HealthChip.tsx";
import { CoolOffDock } from "./cooloff/CoolOffDock.tsx";
import { SigningSheet } from "./covenant/SigningSheet.tsx";
import { DigestInspector } from "./instrument/DigestInspector.tsx";
import { Bench } from "./screens/Bench.tsx";
import { Covenant } from "./screens/Covenant.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Ledger } from "./screens/Ledger.tsx";
import type { SigningRequest, DigestRequest } from "./ui/overlays.ts";
import styles from "./App.module.css";

function Screen({
  routeName,
  onSign,
  onDigest,
  offline,
}: {
  routeName: ReturnType<typeof useRoute>["route"]["name"];
  onSign: (req: SigningRequest) => void;
  onDigest: (req: DigestRequest) => void;
  offline: boolean;
}): JSX.Element {
  const { navigate } = useRoute();
  if (routeName === "covenant") return <Covenant onRequestSign={onSign} />;
  if (routeName === "settings") return <Settings />;
  if (routeName === "ledger" || routeName === "ledger-sku") {
    return (
      <Ledger
        onSelectSku={() => undefined}
        onSelectTxn={() => navigate({ name: "bench" })}
      />
    );
  }
  return <Bench offline={offline} onRequestDigestInspect={onDigest} />;
}

function Shell(): JSX.Element {
  const { route, navigate } = useRoute();
  const [health, setHealth] = useState<HealthState>("ready");
  const [signing, setSigning] = useState<SigningRequest | null>(null);
  const [digest, setDigest] = useState<DigestRequest | null>(null);
  const [refusalsOpen, setRefusalsOpen] = useState(false);

  function handleSigned(): void {
    signing?.onSigned();
    setSigning(null);
  }

  return (
    <div className={styles.shell}>
      <TopBar
        onHealthChange={setHealth}
        active={route.name}
        onNavigate={navigate}
        onRangeClick={() => setRefusalsOpen(true)}
      />
      {refusalsOpen && <RefusalsSheet onClose={() => setRefusalsOpen(false)} />}
      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.routeArea}>
            <Screen
              routeName={route.name}
              onSign={setSigning}
              onDigest={setDigest}
              offline={health === "down"}
            />
          </div>
          <CoolOffDock />
        </div>
      </div>
      {signing !== null && (
        <SigningSheet
          title={signing.title}
          description={signing.description}
          lines={signing.lines}
          thumbprint={signing.thumbprint}
          onSigned={handleSigned}
          onAbort={() => setSigning(null)}
        />
      )}
      {digest !== null && (
        <DigestInspector
          memories={digest.memories}
          claimedDigest={digest.claimedDigest}
          txnId={digest.txnId}
          cartId={digest.cartId}
          onClose={() => setDigest(null)}
        />
      )}
    </div>
  );
}

/**
 * A newly-created account lands in Chat. Only on that one transition: a
 * returning visitor whose stored session restores straight to `ready` keeps
 * whatever deep link they arrived on.
 */
function useLandInChat(status: AuthStatus): void {
  const { navigate } = useRoute();
  const previous = useRef<AuthStatus>("signed-out");
  useEffect(() => {
    if (previous.current === "key-created" && status === "ready") {
      navigate({ name: "bench" });
    }
    previous.current = status;
  }, [status, navigate]);
}

/**
 * The gate. Note the shape of it: the app proper is not rendered — not
 * hidden, not disabled, not rendered — until an identity has been bound to
 * a signing key. There is no state in which a Google credential alone gets
 * you to a screen with a Buy button on it.
 */
function Gate(): JSX.Element {
  const { status } = useAuth();
  useLandInChat(status);
  if (status === "signed-out") return <SignIn />;
  if (status === "ready") return <Shell />;
  return <SignInKey />;
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
