/**
 * Size-bounded map for throttling state. Entries know their own expiry. When the
 * store is full, expired entries are swept using a resumable cursor that walks
 * the whole map across calls; if every entry is still active, the entry with the
 * least time left is evicted (and a warning logged) so an attacker who fills the
 * store cannot lock every other user out.
 */
export interface Expiring {
  /** Epoch ms after which the entry carries no information. */
  readonly expiresAt: number;
}

export type WarnFn = (message: string, context: Record<string, unknown>) => void;

export class BoundedStore<V extends Expiring> {
  private entries = new Map<string, V>();
  private cursor: Iterator<string> | null = null;

  constructor(
    private readonly maxEntries: number,
    private readonly name: string,
    private readonly warn: WarnFn = () => undefined,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Returns the live entry for `key`, dropping it if expired. */
  get(key: string, now: number): V | undefined {
    const v = this.entries.get(key);
    if (v && v.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return v;
  }

  set(key: string, value: V, now: number): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) this.makeRoom(now);
    this.entries.set(key, value);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries = new Map();
    this.cursor = null;
  }

  private makeRoom(now: number): void {
    // Resumable sweep: continue where the previous sweep stopped, covering at most
    // one full pass of the map (restarting the iterator once if it runs out).
    let examined = 0;
    const total = this.entries.size;
    while (examined < total) {
      if (!this.cursor) this.cursor = this.entries.keys();
      const step = this.cursor.next();
      if (step.done) {
        this.cursor = null;
        continue;
      }
      examined += 1;
      const v = this.entries.get(step.value);
      if (v && v.expiresAt <= now) {
        this.entries.delete(step.value);
        return;
      }
    }
    let victim: string | null = null;
    let soonest = Infinity;
    for (const [k, v] of this.entries) {
      if (v.expiresAt < soonest) {
        soonest = v.expiresAt;
        victim = k;
      }
    }
    if (victim !== null) {
      this.entries.delete(victim);
      this.warn('throttle store full of active entries; evicted the one closest to expiry', {
        store: this.name,
        size: this.entries.size + 1,
        remainingMs: soonest - now,
      });
    }
  }
}
