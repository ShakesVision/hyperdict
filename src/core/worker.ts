/**
 * HyperDict Web Worker - Heavy computation offloading
 * Authored by Shakeeb Ahmad
 *
 * Handles:
 * - IDX file parsing and indexing
 * - Binary search operations
 * - Block fetching and decompression
 * - Cache management
 *
 * Communication with main thread via postMessage()
 */

import { ShaekeebIdxParser, ShaekeebIfoParser } from '../index/idx-parser';
import { TypedIndexReader } from '../index/typed-index';
import { ShaekeebBinarySearch } from '../algorithms/binary-search';
import { ShaekeebPrefixIndex } from '../algorithms/prefix-index';
import { ShaekeebBloomFilter } from '../algorithms/bloom-filter';

import type {
  ShaekeebTypedIndex,
  DictionaryMetadata,
  WorkerMessage,
  WorkerResponse,
} from './types';

interface WorkerDictionary {
  name: string;
  index: ShaekeebTypedIndex;
  metadata: DictionaryMetadata;
  search: ShaekeebBinarySearch;
  prefixIndex: ShaekeebPrefixIndex;
  bloomFilter: ShaekeebBloomFilter;
}

/**
 * Worker context - manages dictionaries and performs lookups
 */
class ShaekeebWorkerContext {
  private dictionaries: Map<string, WorkerDictionary> = new Map();
  private idxParser: ShaekeebIdxParser;
  private ifoParser: ShaekeebIfoParser;

  constructor() {
    this.idxParser = new ShaekeebIdxParser();
    this.ifoParser = new ShaekeebIfoParser();
  }

  /**
   * Initialize dictionary in worker
   */
  public async initDictionary(
    name: string,
    ifoUrl: string,
    idxUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Parse metadata
      const metadata = await this.ifoParser.parseIfoFromUrl(ifoUrl);

      if (!this.ifoParser.validate(metadata)) {
        throw new Error('Invalid dictionary metadata');
      }

      // Parse index
      const index = await this.idxParser.parseIdxFromUrl(idxUrl);

      // Create search structures
      const reader = new TypedIndexReader(index);
      const search = new ShaekeebBinarySearch(index);
      const prefixIndex = new ShaekeebPrefixIndex(index);
      const bloomFilter = new ShaekeebBloomFilter(metadata.wordcount);

      // Populate bloom filter
      for (let i = 0; i < index.wordOffsets.length; i++) {
        const wordBytes = reader.getWordBytes(i);
        bloomFilter.addBytes(wordBytes);
      }

      // Store in worker
      this.dictionaries.set(name, {
        name,
        index,
        metadata,
        search,
        prefixIndex,
        bloomFilter,
      });

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize dictionary: ${String(error)}`,
      };
    }
  }

  /**
   * Lookup word in dictionary
   */
  public lookup(dictName: string, word: string): { found: boolean; wordIndex: number } {
    const dict = this.dictionaries.get(dictName);

    if (!dict) {
      return { found: false, wordIndex: -1 };
    }

    // Quick bloom filter check
    if (!dict.bloomFilter.mightContain(word)) {
      return { found: false, wordIndex: -1 };
    }

    // Use prefix index to narrow search
    const prefixRange = dict.prefixIndex.getSearchRange(word);

    if (!prefixRange) {
      return { found: false, wordIndex: -1 };
    }

    // Binary search
    const wordIndex = dict.search.findWord(word);

    return {
      found: wordIndex !== -1,
      wordIndex,
    };
  }

  /**
   * Get word at index
   */
  public getWord(dictName: string, wordIndex: number): string | null {
    const dict = this.dictionaries.get(dictName);

    if (!dict || wordIndex < 0 || wordIndex >= dict.index.wordOffsets.length) {
      return null;
    }

    const wordStart = dict.index.wordOffsets[wordIndex];
    const wordEnd =
      wordIndex + 1 < dict.index.wordOffsets.length
        ? dict.index.wordOffsets[wordIndex + 1]
        : dict.index.wordsBuffer.length;

    const wordBytes = dict.index.wordsBuffer.slice(wordStart, wordEnd);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(wordBytes);
  }

  /**
   * Get entry metadata
   */
  public getEntryMetadata(
    dictName: string,
    wordIndex: number
  ): { offset: number; length: number } | null {
    const dict = this.dictionaries.get(dictName);

    if (!dict || wordIndex < 0 || wordIndex >= dict.index.offsetArray.length) {
      return null;
    }

    return {
      offset: dict.index.offsetArray[wordIndex],
      length: dict.index.lengthArray[wordIndex],
    };
  }

  /**
   * Get all registered dictionaries
   */
  public getDictionaries(): Array<{ name: string; wordCount: number }> {
    return Array.from(this.dictionaries.entries()).map(([name, dict]) => ({
      name,
      wordCount: dict.index.wordOffsets.length,
    }));
  }
}

// Create worker instance
const workerContext = new ShaekeebWorkerContext();

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>): Promise<void> => {
  const { type, payload } = event.data;
  let response: WorkerResponse;

  try {
    switch (type) {
      case 'init': {
        const { name, ifoUrl, idxUrl } = payload as {
          name: string;
          ifoUrl: string;
          idxUrl: string;
        };
        response = await workerContext.initDictionary(name, ifoUrl, idxUrl);
        break;
      }

      case 'lookup': {
        const { dictName, word } = payload as { dictName: string; word: string };
        const result = workerContext.lookup(dictName, word);
        response = {
          success: true,
          data: result,
        };
        break;
      }

      case 'getWord': {
        const { dictName, wordIndex } = payload as { dictName: string; wordIndex: number };
        const word = workerContext.getWord(dictName, wordIndex);
        response = {
          success: word !== null,
          data: word,
        };
        break;
      }

      case 'getEntryMetadata': {
        const { dictName, wordIndex } = payload as { dictName: string; wordIndex: number };
        const metadata = workerContext.getEntryMetadata(dictName, wordIndex);
        response = {
          success: metadata !== null,
          data: metadata,
        };
        break;
      }

      case 'getDictionaries': {
        const dicts = workerContext.getDictionaries();
        response = {
          success: true,
          data: dicts,
        };
        break;
      }

      default:
        response = {
          success: false,
          error: `Unknown message type: ${type}`,
        };
    }
  } catch (error) {
    response = {
      success: false,
      error: `Worker error: ${String(error)}`,
    };
  }

  // Send response back to main thread
  self.postMessage(response);
};

// Indicate worker is ready
console.log('HyperDict Worker initialized');
