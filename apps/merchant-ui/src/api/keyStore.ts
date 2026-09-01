// Durable custody for the merchant's signing key, on the merchant's own
// device.
//
// DECISION: IndexedDB, holding a **non-extractable `CryptoKey` handle** — not
// the JWK, not the `d` parameter, not any serialisation of the private half.
// Structured clone carries `CryptoKey` verbatim, so what comes back out is a
// capability to sign and nothing else: this page cannot export the key, cannot
// read its bytes, and so cannot send it anywhere, even to us.
//
// What that buys and what it costs is written down in `merchantKey.ts`, where
// the import happens. This file is only the shelf.

const DB_NAME = "covenant-merchant-keys";

const STORE = "signing-keys";

const VERSION = 1;

export type StoredKey = { slug: string; kid: string; key: CryptoKey };

function available(): IDBFactory | null {
  return globalThis.indexedDB ?? null;
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "slug" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb"));
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("indexeddb"));
  });
}

/**
 * Every entry point swallows its failure and answers as though the shelf were
 * empty. A private window, a hardened profile or a browser with storage
 * blocked costs the shopkeeper one file selection per session; it must never
 * cost them the console.
 */
async function withStore<T>(
  fallback: T,
  work: (db: IDBDatabase) => Promise<T>,
): Promise<T> {
  const factory = available();
  if (factory === null) return fallback;
  try {
    return await work(await openDb(factory));
  } catch {
    return fallback;
  }
}

export function rememberKey(record: StoredKey): Promise<boolean> {
  return withStore(false, async (db) => {
    await run(db, "readwrite", (store) => store.put(record));
    return true;
  });
}

export function recallKey(slug: string): Promise<StoredKey | null> {
  return withStore<StoredKey | null>(null, async (db) => {
    const found = await run<StoredKey | undefined>(db, "readonly", (store) =>
      store.get(slug),
    );
    return found ?? null;
  });
}

export function forgetStoredKey(slug: string): Promise<void> {
  return withStore(undefined, async (db) => {
    await run(db, "readwrite", (store) => store.delete(slug));
  });
}
