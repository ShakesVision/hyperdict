/**
 * HyperDict Core Engine
 * Authored by Shakeeb Ahmad
 *
 * Orchestrates a set of StarDict dictionaries:
 *   - lazy registration, parallel loading on init()
 *   - cross-dictionary word lookup (which dictionaries contain a word)
 *   - on-demand definition fetching via dictzip / plain .dict random access
 *   - a dictionary-set model: dictionaries are default (registered in code) or
 *     custom (added at runtime), each enabled or disabled. Disabling UNLOADS a
 *     dictionary (frees its index memory) but keeps its config so it can be
 *     re-enabled cheaply; removing/purging drops it (purge also clears its
 *     cached files). This makes the UI's toggle/remove/reset safe and reversible.
 *
 * The engine is DOM-free and framework-agnostic. fflate is bundled.
 */

import { rawInflate } from '../dictzip/inflate';
import { Dictionary, resolveFiles } from '../dict/dictionary';
import { deleteCachedFiles } from '../io/cached-fetch';
import type {
  DictionaryConfig,
  DictionaryMetadata,
  LookupResult,
  DefinitionResult,
} from './types';

export type DictionaryOrigin = 'default' | 'custom';

export interface HyperDictOptions {
  /** Decompressed dictzip-chunk LRU size per dictionary. Default 32 (~2 MB). */
  cacheSize?: number;
  /** Cache whole-file fetches (.ifo/.idx/.syn) in Cache Storage across reloads. */
  persist?: boolean;
  /**
   * Build a Bloom filter per dictionary for O(1) negative lookups. Default
   * `false`: the prefix index + binary search already give fast (O(log n))
   * negatives, and skipping the filter avoids a full-corpus hashing pass at
   * load — a meaningful win for large dictionaries on low-end devices.
   */
  bloom?: boolean;
  /**
   * Build a diacritic-normalized headword map for bidirectional
   * diacritic-insensitive lookup (extra load cost). Query-side diacritic
   * stripping works without this. Default false. Per-dictionary override via
   * `DictionaryConfig` is not needed — this applies engine-wide.
   */
  normalize?: boolean;
  /**
   * Download whole content files (`.dict.dz`/`.dict`) up front instead of
   * range-reading. With `persist`, this caches the entire dictionary to the
   * device — "download once, offline forever" (ideal for Ionic/Android). Can
   * also be set per-dictionary via `DictionaryConfig.preload`. Default false.
   */
  preload?: boolean;
}

/** A known dictionary and its current state (see `listDictionaries`). */
export interface DictionaryInfo {
  name: string;
  label: string;
  origin: DictionaryOrigin;
  enabled: boolean;
  loaded: boolean;
  metadata?: DictionaryMetadata;
  config: DictionaryConfig;
}

export class HyperDict {
  private configs: Map<string, DictionaryConfig> = new Map();
  private origins: Map<string, DictionaryOrigin> = new Map();
  private disabled: Set<string> = new Set();
  private dictionaries: Map<string, Dictionary> = new Map();

  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly options: HyperDictOptions;
  private readonly workerSupported = typeof Worker !== 'undefined';

  constructor(options: HyperDictOptions = {}) {
    this.options = options;
  }

  private deps(): Parameters<typeof Dictionary.load>[1] {
    return {
      inflate: rawInflate,
      cacheSize: this.options.cacheSize,
      persist: this.options.persist,
      useBloom: this.options.bloom,
      normalize: this.options.normalize,
      preload: this.options.preload,
    };
  }

  /**
   * Register a dictionary for loading. **Synchronous** — no I/O until init().
   * `origin` marks whether this is a built-in (default) or user-added (custom)
   * dictionary; it drives the UI's remove/reset behavior.
   */
  public registerDictionary(config: DictionaryConfig, origin: DictionaryOrigin = 'default'): void {
    if (this.configs.has(config.name)) {
      console.warn(`Dictionary '${config.name}' already registered`);
      return;
    }
    this.configs.set(config.name, config);
    this.origins.set(config.name, origin);
  }

  /**
   * Register AND load a dictionary at runtime (after init()). Marked `custom`
   * by default. Rejects if the name is taken or loading fails.
   */
  public async addDictionary(
    config: DictionaryConfig,
    origin: DictionaryOrigin = 'custom'
  ): Promise<void> {
    if (this.configs.has(config.name)) {
      throw new Error(`Dictionary '${config.name}' already exists`);
    }
    const dict = await Dictionary.load(config, this.deps());
    this.configs.set(config.name, config);
    this.origins.set(config.name, origin);
    this.disabled.delete(config.name);
    this.dictionaries.set(config.name, dict);
  }

  /**
   * Enable or disable a dictionary. Disabling unloads it (frees memory) but
   * keeps its config; enabling (re)loads it. Safe to call before init().
   */
  public async setEnabled(name: string, enabled: boolean): Promise<void> {
    if (!this.configs.has(name)) {
      throw new Error(`Dictionary '${name}' is not registered`);
    }
    if (enabled) {
      this.disabled.delete(name);
      if (this.initialized && !this.dictionaries.has(name)) {
        const dict = await Dictionary.load(this.configs.get(name) as DictionaryConfig, this.deps());
        this.dictionaries.set(name, dict);
      }
    } else {
      this.disabled.add(name);
      this.dictionaries.delete(name); // unload → eligible for GC
    }
  }

  /** Remove a dictionary entirely. Keeps any cached files (re-add is cheap). */
  public removeDictionary(name: string): boolean {
    const known = this.configs.delete(name);
    this.origins.delete(name);
    this.disabled.delete(name);
    this.dictionaries.delete(name);
    return known;
  }

  /**
   * Permanently delete a dictionary AND its cached files from Cache Storage
   * (frees storage). Use for a hard "delete", vs `setEnabled(false)` for a
   * reversible hide.
   */
  public async purgeDictionary(name: string): Promise<boolean> {
    const config = this.configs.get(name);
    const urls: string[] = [];
    if (config) {
      if (config.archive) {
        urls.push(config.archive);
      } else {
        try {
          const f = resolveFiles(config);
          urls.push(f.ifo, f.idx, f.dict);
          if (f.syn) urls.push(f.syn);
        } catch {
          /* nothing to purge */
        }
      }
    }
    const removed = this.removeDictionary(name);
    if (urls.length) {
      await deleteCachedFiles(urls);
    }
    return removed;
  }

  /**
   * Reorder dictionaries to match `orderedNames` (drives tab order). Names not
   * listed keep their relative order at the end; unknown names are ignored.
   */
  public reorderDictionaries(orderedNames: string[]): void {
    const configs = new Map<string, DictionaryConfig>();
    const origins = new Map<string, DictionaryOrigin>();
    const take = (name: string): void => {
      const cfg = this.configs.get(name);
      if (cfg && !configs.has(name)) {
        configs.set(name, cfg);
        origins.set(name, this.origins.get(name) ?? 'default');
      }
    };
    orderedNames.forEach(take);
    for (const name of this.configs.keys()) take(name); // append any not listed
    this.configs = configs;
    this.origins = origins;
  }

  /**
   * Reset to the default set: remove all custom dictionaries and (re)enable
   * every default. Loads any default that was disabled.
   */
  public async resetToDefaults(): Promise<void> {
    for (const [name, origin] of Array.from(this.origins.entries())) {
      if (origin === 'custom') {
        this.removeDictionary(name);
      }
    }
    const toEnable = Array.from(this.configs.keys()).filter((n) => this.disabled.has(n));
    await Promise.allSettled(toEnable.map((n) => this.setEnabled(n, true)));
  }

  /**
   * Load all enabled dictionaries in parallel. Idempotent and re-entrancy-safe:
   * concurrent calls share one load. Per-dictionary failures are logged and
   * skipped; only throws if every enabled dictionary fails.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    const names = Array.from(this.configs.keys()).filter((n) => !this.disabled.has(n));
    const results = await Promise.allSettled(
      names.map(async (name) => {
        const dict = await Dictionary.load(this.configs.get(name) as DictionaryConfig, this.deps());
        this.dictionaries.set(name, dict);
      })
    );

    this.initialized = true;

    const failures = results
      .map((r, i) => ({ r, name: names[i] }))
      .filter((x) => x.r.status === 'rejected');
    if (failures.length > 0) {
      const detail = failures
        .map((f) => `${f.name}: ${String((f.r as PromiseRejectedResult).reason)}`)
        .join('; ');
      console.warn(`[hyperdict] ${failures.length} dictionary(ies) failed to load — ${detail}`);
      if (names.length > 0 && this.dictionaries.size === 0) {
        throw new Error(`Failed to load any dictionary. ${detail}`);
      }
    }
  }

  /** Which loaded dictionaries contain `word` (headword, case-insensitive, or synonym). */
  public lookup(word: string): LookupResult {
    this.assertReady();
    const dictionaries = Array.from(this.dictionaries.values()).map((dict) => ({
      name: dict.name,
      found: dict.has(word),
    }));
    return { word, dictionaries };
  }

  /** Fetch the definition for `word` from one dictionary. Returns null if absent. */
  public async getDefinition(dictName: string, word: string): Promise<DefinitionResult | null> {
    this.assertReady();
    const dict = this.dictionaries.get(dictName);
    if (!dict) {
      throw new Error(`Dictionary '${dictName}' not found (not loaded/enabled)`);
    }
    return dict.getDefinition(word);
  }

  /**
   * Autocomplete: up to `limit` headwords starting with `prefix`, merged across
   * enabled dictionaries (deduped, sorted). Synchronous and index-only — fast.
   */
  public suggest(prefix: string, limit = 10): string[] {
    this.assertReady();
    if (!prefix.trim()) return [];
    const set = new Set<string>();
    for (const dict of this.dictionaries.values()) {
      for (const w of dict.suggest(prefix, limit)) set.add(w);
    }
    return Array.from(set).sort().slice(0, limit);
  }

  /**
   * Reverse lookup: headwords in `dictName` whose DEFINITION contains `query`
   * (e.g. find Urdu words whose English gloss contains a word). Scans the whole
   * dictionary — best with `preload`/offline. See Dictionary.reverseLookup.
   */
  public async reverseLookup(
    dictName: string,
    query: string,
    opts?: { limit?: number; onProgress?: (done: number, total: number) => void }
  ): Promise<string[]> {
    this.assertReady();
    const dict = this.dictionaries.get(dictName);
    if (!dict) throw new Error(`Dictionary '${dictName}' not found`);
    return dict.reverseLookup(query, opts);
  }

  /** Fetch `word` from every loaded dictionary that has it, in parallel. */
  public async define(word: string): Promise<DefinitionResult[]> {
    this.assertReady();
    const settled = await Promise.allSettled(
      Array.from(this.dictionaries.values()).map((dict) => dict.getDefinition(word))
    );
    return settled
      .filter(
        (s): s is PromiseFulfilledResult<DefinitionResult> =>
          s.status === 'fulfilled' && s.value !== null
      )
      .map((s) => s.value);
  }

  /** Loaded (enabled) dictionaries with their parsed metadata and config. */
  public getDictionaries(): Array<{
    name: string;
    metadata: DictionaryMetadata;
    config: DictionaryConfig;
  }> {
    // Follow the config order (which reorderDictionaries controls) so tab order
    // is stable and user-controllable, not "whichever loaded first".
    const out: Array<{ name: string; metadata: DictionaryMetadata; config: DictionaryConfig }> = [];
    for (const name of this.configs.keys()) {
      const dict = this.dictionaries.get(name);
      if (dict) {
        out.push({ name: dict.name, metadata: dict.metadata, config: dict.config });
      }
    }
    return out;
  }

  /** Every KNOWN dictionary (enabled or not) with its state — drives the manage UI. */
  public listDictionaries(): DictionaryInfo[] {
    return Array.from(this.configs.entries()).map(([name, config]) => {
      const dict = this.dictionaries.get(name);
      return {
        name,
        label: config.label || dict?.metadata.bookname || name,
        origin: this.origins.get(name) ?? 'default',
        enabled: !this.disabled.has(name),
        loaded: !!dict,
        metadata: dict?.metadata,
        config,
      };
    });
  }

  public hasDictionary(name: string): boolean {
    return this.dictionaries.has(name);
  }

  /** Whether a config is registered (loaded or not). */
  public hasConfig(name: string): boolean {
    return this.configs.has(name);
  }

  /** Serializable configs. Pass `origin` to filter (e.g. persist only 'custom'). */
  public exportConfig(origin?: DictionaryOrigin): DictionaryConfig[] {
    return Array.from(this.configs.entries())
      .filter(([name]) => !origin || this.origins.get(name) === origin)
      .map(([, c]) => ({ ...c }));
  }

  /** Load a set of configs (skips names already present). */
  public async importConfig(
    configs: DictionaryConfig[],
    origin: DictionaryOrigin = 'custom'
  ): Promise<void> {
    await Promise.allSettled(
      configs.filter((c) => !this.configs.has(c.name)).map((c) => this.addDictionary(c, origin))
    );
  }

  public getStats(): {
    initialized: boolean;
    dictionaryCount: number;
    totalWords: number;
    memoryUsage: number;
    workerSupported: boolean;
  } {
    let totalWords = 0;
    let memoryUsage = 0;
    for (const dict of this.dictionaries.values()) {
      totalWords += dict.wordCount;
      memoryUsage += dict.getMemoryUsage();
    }
    return {
      initialized: this.initialized,
      dictionaryCount: this.dictionaries.size,
      totalWords,
      memoryUsage,
      workerSupported: this.workerSupported,
    };
  }

  private assertReady(): void {
    if (!this.initialized) {
      throw new Error('HyperDict not initialized. Call init() first.');
    }
  }
}
