// Node 24 ships its own experimental `localStorage` global, and it shadows
// jsdom's inside the Vitest jsdom environment. Without `--localstorage-file`
// it is a stub whose methods are missing outright — `window.localStorage`
// exists but `getItem` is not a function.
//
// That is a genuinely useful accident (it is why the auth code's try/catch
// guards are not decoration) but it makes storage untestable as-is, so the
// suites that exercise persistence install a real one first.

type MemoryStorage = {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

function build(): MemoryStorage {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

/** Give `window.localStorage` a working, empty implementation. */
export function installMemoryStorage(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: build(),
  });
}

/**
 * A private window, faithfully: touching the property itself throws, which
 * is what Safari and hardened Firefox profiles actually do — not a method
 * that fails, an access that fails.
 */
export function withHostileStorage(run: () => void): void {
  const saved = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get(): never {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
  try {
    run();
  } finally {
    if (saved === undefined) Reflect.deleteProperty(window, "localStorage");
    else Object.defineProperty(window, "localStorage", saved);
  }
}
