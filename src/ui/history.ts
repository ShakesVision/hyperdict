/**
 * Recent-search history store
 * Authored by Shakeeb Ahmad
 *
 * A tiny, bounded, most-recent-first list of looked-up words, optionally
 * persisted to localStorage so it survives reloads. Capped by count (default
 * 50) — enough to be useful, small enough to never matter for storage.
 */

export interface HistoryOptions {
  /** Max words to retain. Default 50. */
  limit?: number;
  /** Persist to localStorage under this key. Omit/null to keep in-memory only. */
  storageKey?: string | null;
}

export class SearchHistory {
  private readonly limit: number;
  private readonly storageKey: string | null;
  private words: string[] = [];

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 50;
    this.storageKey = options.storageKey ?? null;
    this.load();
  }

  /** Record a lookup, moving it to the front and de-duplicating. */
  public add(word: string): void {
    const w = word.trim();
    if (!w) return;
    this.words = [w, ...this.words.filter((x) => x !== w)].slice(0, this.limit);
    this.save();
  }

  /** Most-recent-first list. */
  public list(): string[] {
    return [...this.words];
  }

  public clear(): void {
    this.words = [];
    this.save();
  }

  private load(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.words = parsed.filter((x): x is string => typeof x === 'string').slice(0, this.limit);
        }
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
  }

  private save(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.words));
    } catch {
      /* ignore quota/availability errors */
    }
  }
}
