/**
 * jsdom corre con origen opaco, así que no expone `localStorage`. Se instala una
 * implementación en memoria para poder probar la persistencia de tema y sesión.
 *
 * Es idempotente y NO se desinstala: el runner de Angular corre los specs en el
 * mismo proceso (`isolate: false` por defecto), así que quitar el stub en un
 * afterEach se lo arrancaría a las suites que aún no han terminado. Cada test
 * limpia su propio estado con `localStorage.clear()`.
 */
export function installLocalStorage(): void {
  const target = globalThis as unknown as { localStorage?: Storage; window?: Window };

  if (target.localStorage instanceof MemoryStorage) {
    target.localStorage.clear();
    return;
  }

  const storage = new MemoryStorage();
  const descriptor = { value: storage, configurable: true, writable: true };

  Object.defineProperty(target, 'localStorage', descriptor);
  if (target.window) {
    Object.defineProperty(target.window, 'localStorage', descriptor);
  }
}

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  [name: string]: unknown;
}
