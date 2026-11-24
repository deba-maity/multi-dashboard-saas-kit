// A tab-local change takes precedence over an older stored value when writes
// are blocked. A successful later write returns the key to cross-tab storage.
const temporary = new Map<string, string | null>();

export function readBrowserRecord(key: string): string | null {
  if (temporary.has(key)) return temporary.get(key) ?? null;
  try { return localStorage.getItem(key); }
  catch { return null; }
}

export function writeBrowserRecord(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    temporary.delete(key);
    return true;
  } catch {
    temporary.set(key, value);
    return false;
  }
}

export async function withBrowserLock<T>(name: string, change: () => T): Promise<T> {
  if (!navigator.locks) return change();
  try { return await navigator.locks.request(name, change); }
  catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") return change();
    throw error;
  }
}
