/**
 * HyperDict Core Engine - Main dictionary lookup system
 * Authored by Shakeeb Ahmad
 *
 * The main engine that orchestrates all components:
 * - Dictionary registration and lazy loading
 * - Word lookup across multiple dictionaries
 * - Definition fetching with worker support
 */

import { ShaekeebIdxParser, ShaekeebIfoParser } from '../index/idx-parser';
import { TypedIndexReader } from '../index/typed-index';
import { ShaekeebBinarySearch } from '../algorithms/binary-search';
import { ShaekeebPrefixIndex } from '../algorithms/prefix-index';
import { ShaekeebBloomFilter } from '../algorithms/bloom-filter';

import type {
  DictionaryConfig,
  DictionaryMetadata,
  ShaekeebTypedIndex,
  LookupResult,
  DefinitionResult,
} from './types';

interface LoadedDictionary {
  config: DictionaryConfig;
  metadata: DictionaryMetadata;
  index: ShaekeebTypedIndex;
  reader: TypedIndexReader;
  search: ShaekeebBinarySearch;
  prefixIndex: ShaekeebPrefixIndex;
  bloomFilter: ShaekeebBloomFilter;
  dictZipHeader?: unknown; // Will be DictZipHeader when needed
}

export class HyperDict {
  private dictionaries: Map<string, LoadedDictionary> = new Map();
  private idxParser: ShaekeebIdxParser;
  private ifoParser: ShaekeebIfoParser;
  private initialized: boolean = false;
  private workerSupported: boolean = typeof Worker !== 'undefined';

  constructor() {
    this.idxParser = new ShaekeebIdxParser();
    this.ifoParser = new ShaekeebIfoParser();
  }

  /**
   * Register a dictionary for loading
   * Does NOT load it immediately - lazy loading on init
   */
  public registerDictionary(config: DictionaryConfig): void {
    if (this.dictionaries.has(config.name)) {
      console.warn(`Dictionary '${config.name}' already registered`);
      return;
    }

    // Just store config for now, will load later in init()
    this.dictionaries.set(config.name, {
      config,
      metadata: {} as DictionaryMetadata,
      index: {} as ShaekeebTypedIndex,
      reader: {} as TypedIndexReader,
      search: {} as ShaekeebBinarySearch,
      prefixIndex: {} as ShaekeebPrefixIndex,
      bloomFilter: {} as ShaekeebBloomFilter,
    });
  }

  /**
   * Initialize engine - loads all registered dictionaries
   * Parses .ifo and .idx files
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const loadPromises: Promise<void>[] = [];

    for (const [dictName, dictData] of this.dictionaries.entries()) {
      loadPromises.push(this.loadDictionary(dictName, dictData.config));
    }

    try {
      await Promise.all(loadPromises);
      this.initialized = true;
      console.log(`HyperDict initialized with ${this.dictionaries.size} dictionaries`);
    } catch (error) {
      throw new Error(`Failed to initialize HyperDict: ${String(error)}`);
    }
  }

  /**
   * Load a single dictionary
   */
  private async loadDictionary(dictName: string, config: DictionaryConfig): Promise<void> {
    try {
      // Parse .ifo file
      const ifoUrl = `${config.path}${config.path.endsWith('/') ? '' : '/'}${dictName}.ifo`;
      const metadata = await this.ifoParser.parseIfoFromUrl(ifoUrl);

      if (!this.ifoParser.validate(metadata)) {
        throw new Error('Invalid dictionary metadata');
      }

      // Parse .idx file
      const idxUrl = `${config.path}${config.path.endsWith('/') ? '' : '/'}${dictName}.idx`;
      const index = await this.idxParser.parseIdxFromUrl(idxUrl);

      // Create reader and search structures
      const reader = new TypedIndexReader(index);
      const search = new ShaekeebBinarySearch(index);
      const prefixIndex = new ShaekeebPrefixIndex(index);
      const bloomFilter = new ShaekeebBloomFilter(metadata.wordcount);

      // Populate bloom filter with all words
      for (let i = 0; i < index.wordOffsets.length; i++) {
        const wordBytes = reader.getWordBytes(i);
        bloomFilter.addBytes(wordBytes);
      }

      // Update loaded dictionary
      const dictData = this.dictionaries.get(dictName);
      if (dictData) {
        dictData.metadata = metadata;
        dictData.index = index;
        dictData.reader = reader;
        dictData.search = search;
        dictData.prefixIndex = prefixIndex;
        dictData.bloomFilter = bloomFilter;
      }

      console.log(
        `Loaded dictionary '${dictName}': ${metadata.wordcount} words, size: ${(metadata.idxfilesize / 1024).toFixed(1)}KB`
      );
    } catch (error) {
      console.error(`Failed to load dictionary '${dictName}':`, error);
      throw error;
    }
  }

  /**
   * Lookup word across all dictionaries
   * Returns which dictionaries contain this word
   */
  public lookup(word: string): LookupResult {
    if (!this.initialized) {
      throw new Error('HyperDict not initialized. Call init() first.');
    }

    const result: LookupResult = {
      word,
      dictionaries: [],
    };

    for (const [dictName, dictData] of this.dictionaries.entries()) {
      if (!dictData.search) {
        continue;
      }

      // Quick bloom filter check first
      if (!dictData.bloomFilter.mightContain(word)) {
        result.dictionaries.push({
          name: dictName,
          found: false,
        });
        continue;
      }

      // Use prefix index to narrow search range
      const prefixRange = dictData.prefixIndex.getSearchRange(word);

      if (prefixRange) {
        // Binary search within prefix range
        // For now, just use regular search
        const wordIndex = dictData.search.findWord(word);
        const found = wordIndex !== -1;

        result.dictionaries.push({
          name: dictName,
          found,
        });
      } else {
        result.dictionaries.push({
          name: dictName,
          found: false,
        });
      }
    }

    return result;
  }

  /**
   * Get definition from specific dictionary
   * Note: Requires full block reader implementation for .dict.dz
   */
  public async getDefinition(dictName: string, word: string): Promise<DefinitionResult | null> {
    if (!this.initialized) {
      throw new Error('HyperDict not initialized. Call init() first.');
    }

    const dictData = this.dictionaries.get(dictName);
    if (!dictData) {
      throw new Error(`Dictionary '${dictName}' not found`);
    }

    const wordIndex = dictData.search.findWord(word);
    if (wordIndex === -1) {
      return null;
    }

    return {
      word,
      definition: '', // Would be fetched from .dict.dz file
      dictName,
    };
  }

  /**
   * Get all registered dictionaries
   */
  public getDictionaries(): Array<{ name: string; metadata: DictionaryMetadata }> {
    return Array.from(this.dictionaries.entries()).map(([name, data]) => ({
      name,
      metadata: data.metadata,
    }));
  }

  /**
   * Get engine statistics
   */
  public getStats(): {
    initialized: boolean;
    dictionaryCount: number;
    totalWords: number;
    memoryUsage: number;
    workerSupported: boolean;
  } {
    let totalWords = 0;
    let memoryUsage = 0;

    for (const dictData of this.dictionaries.values()) {
      if (dictData.index.wordOffsets) {
        totalWords += dictData.index.wordOffsets.length;

        if (dictData.index.wordsBuffer) {
          memoryUsage += dictData.index.wordsBuffer.byteLength;
          memoryUsage += dictData.index.wordOffsets.byteLength;
          memoryUsage += dictData.index.offsetArray.byteLength;
          memoryUsage += dictData.index.lengthArray.byteLength;
        }

        if (dictData.bloomFilter && typeof dictData.bloomFilter.getMemoryUsage === 'function') {
          memoryUsage += dictData.bloomFilter.getMemoryUsage();
        }

        if (dictData.prefixIndex && typeof dictData.prefixIndex.getMemoryUsage === 'function') {
          memoryUsage += dictData.prefixIndex.getMemoryUsage();
        }
      }
    }

    return {
      initialized: this.initialized,
      dictionaryCount: this.dictionaries.size,
      totalWords,
      memoryUsage,
      workerSupported: this.workerSupported,
    };
  }
}
