/**
 * HyperDict Core Engine
 * Authored by Shakeeb Ahmad
 *
 * Orchestrates a set of StarDict dictionaries:
 *   - lazy registration, parallel loading on init()
 *   - cross-dictionary word lookup (which dictionaries contain a word)
 *   - on-demand definition fetching via dictzip random access
 *
 * The engine is DOM-free and framework-agnostic. fflate is bundled, so callers
 * do not need to inject a decompressor or add a <script> tag.
 */

import { rawInflate } from '../dictzip/inflate';
import { Dictionary } from '../dict/dictionary';
import type {
  DictionaryConfig,
  DictionaryMetadata,
  LookupResult,
  DefinitionResult,
} from './types';

export interface HyperDictOptions {
  /** Decompressed-chunk LRU size per dictionary. Default 32 (~2 MB). */
  cacheSize?: number;
  /** Cache whole-file fetches (.ifo/.idx/.syn) in Cache Storage across reloads. */
  persist?: boolean;
}

export class HyperDict {
  private configs: Map<string, DictionaryConfig> = new Map();
  private dictionaries: Map<string, Dictionary> = new Map();
  private initialized = false;
  private readonly options: HyperDictOptions;
  private readonly workerSupported = typeof Worker !== 'undefined';

  constructor(options: HyperDictOptions = {}) {
    this.options = options;
  }

  /** Register a dictionary for loading. No I/O happens until init(). */
  public registerDictionary(config: DictionaryConfig): void {
    if (this.configs.has(config.name)) {
      console.warn(`Dictionary '${config.name}' already registered`);
      return;
    }
    this.configs.set(config.name, config);
  }

  /**
   * Register AND load a dictionary at runtime (after init()). Resolves once the
   * dictionary is queryable. Throws if the name is taken or loading fails.
   */
  public async addDictionary(config: DictionaryConfig): Promise<void> {
    if (this.configs.has(config.name)) {
      throw new Error(`Dictionary '${config.name}' already exists`);
    }
    const dict = await Dictionary.load(config, {
      inflate: rawInflate,
      cacheSize: this.options.cacheSize,
      persist: this.options.persist,
    });
    this.configs.set(config.name, config);
    this.dictionaries.set(config.name, dict);
  }

  /** Remove a dictionary (its index/caches become eligible for GC). */
  public removeDictionary(name: string): boolean {
    const had = this.dictionaries.delete(name);
    this.configs.delete(name);
    return had;
  }

  /**
   * Serializable list of registered dictionary configs — hand to importConfig()
   * (or persist yourself) to restore the exact dictionary set later.
   */
  public exportConfig(): DictionaryConfig[] {
    return Array.from(this.configs.values()).map((c) => ({ ...c }));
  }

  /**
   * Load a set of dictionary configs (e.g. from exportConfig()/localStorage),
   * skipping any whose name is already present. Failures are per-dictionary.
   */
  public async importConfig(configs: DictionaryConfig[]): Promise<void> {
    await Promise.allSettled(
      configs.filter((c) => !this.configs.has(c.name)).map((c) => this.addDictionary(c))
    );
  }

  /**
   * Load all registered dictionaries in parallel. Individual failures are
   * collected and surfaced, but successfully-loaded dictionaries remain usable.
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const results = await Promise.allSettled(
      Array.from(this.configs.values()).map(async (config) => {
        const dict = await Dictionary.load(config, {
          inflate: rawInflate,
          cacheSize: this.options.cacheSize,
          persist: this.options.persist,
        });
        this.dictionaries.set(config.name, dict);
      })
    );

    const failures = results
      .map((r, i) => ({ r, name: Array.from(this.configs.keys())[i] }))
      .filter((x) => x.r.status === 'rejected');

    this.initialized = true;

    if (failures.length > 0) {
      const detail = failures
        .map((f) => `${f.name}: ${String((f.r as PromiseRejectedResult).reason)}`)
        .join('; ');
      console.warn(`[hyperdict] ${failures.length} dictionary(ies) failed to load — ${detail}`);
      if (this.dictionaries.size === 0) {
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
      throw new Error(`Dictionary '${dictName}' not found`);
    }
    return dict.getDefinition(word);
  }

  /**
   * Convenience: fetch `word` from every dictionary that contains it.
   * Dictionaries are queried in parallel; entries with no definition are omitted.
   */
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

  public getDictionaries(): Array<{
    name: string;
    metadata: DictionaryMetadata;
    config: DictionaryConfig;
  }> {
    return Array.from(this.dictionaries.values()).map((dict) => ({
      name: dict.name,
      metadata: dict.metadata,
      config: dict.config,
    }));
  }

  /** Whether a dictionary with this name is currently loaded. */
  public hasDictionary(name: string): boolean {
    return this.dictionaries.has(name);
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
