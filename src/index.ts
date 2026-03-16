/**
 * HyperDict - Ultra-fast StarDict dictionary engine for the browser
 * Authored by Shakeeb Ahmad
 *
 * This is the main entry point. Export all public APIs.
 */

// Core engine
export { HyperDict } from './core/engine';

// Types
export type {
  ShaekeebTypedIndex,
  DictionaryEntry,
  DictionaryMetadata,
  DictionaryConfig,
  LookupResult,
  DefinitionResult,
  DictZipHeader,
} from './core/types';

// Algorithms
export { ShaekeebBinarySearch } from './algorithms/binary-search';
export { ShaekeebPrefixIndex } from './algorithms/prefix-index';
export { ShaekeebBloomFilter } from './algorithms/bloom-filter';
export { ShaekeebLRUCache } from './algorithms/lru-cache';

// IDX Parser
export { ShaekeebIdxParser, ShaekeebIfoParser } from './index/idx-parser';
export { ShaekeebTypedIndexBuilder, TypedIndexReader } from './index/typed-index';

// DictZip
export { ShaekeebDictZipHeaderParser } from './dictzip/header-parser';
export { ShaekeebBlockReader } from './dictzip/block-reader';

// IO
export { ShaekeebRangeFetcher } from './io/range-fetch';
