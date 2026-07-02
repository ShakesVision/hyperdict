/**
 * HyperDict - Ultra-fast StarDict dictionary engine for the browser
 * Authored by Shakeeb Ahmad
 *
 * Public entry point for the core (DOM-free) engine. The reusable popup UI
 * lives in a separate entry: `hyperdict/ui` (src/ui.ts).
 */

// Core engine
export { HyperDict } from './core/engine';
export type { HyperDictOptions } from './core/engine';

// Single-dictionary unit (advanced / custom usage)
export { Dictionary, resolveFiles } from './dict/dictionary';
export type { DictionaryDeps } from './dict/dictionary';
export { PlainDictReader } from './dict/content-reader';
export type { ContentReader } from './dict/content-reader';
export { stripDiacritics, hasDiacritics } from './dict/normalize';

// Byte sources (HTTP range / in-memory buffer)
export { HttpByteSource, BufferByteSource } from './io/byte-source';
export type { ByteSource } from './io/byte-source';

// Types
export type {
  ShaekeebTypedIndex,
  DictionaryEntry,
  DictionaryMetadata,
  DictionaryConfig,
  DictionaryFiles,
  LookupResult,
  DefinitionResult,
  DictZipHeader,
} from './core/types';

// Persistence / caching
export { fetchBuffer, fetchText, clearFileCache, DEFAULT_CACHE_NAME } from './io/cached-fetch';
export type { FetchOptions } from './io/cached-fetch';

// Algorithms (reusable building blocks)
export { ShaekeebBinarySearch } from './algorithms/binary-search';
export { ShaekeebPrefixIndex } from './algorithms/prefix-index';
export { ShaekeebBloomFilter } from './algorithms/bloom-filter';
export { ShaekeebLRUCache } from './algorithms/lru-cache';

// Parsers
export { ShaekeebIdxParser, ShaekeebIfoParser } from './index/idx-parser';
export { ShaekeebTypedIndexBuilder, TypedIndexReader } from './index/typed-index';

// DictZip
export { ShaekeebDictZipHeaderParser } from './dictzip/header-parser';
export { ShaekeebBlockReader } from './dictzip/block-reader';
export type { RawInflate } from './dictzip/block-reader';
export { rawInflate } from './dictzip/inflate';

// IO
export { ShaekeebRangeFetcher } from './io/range-fetch';
