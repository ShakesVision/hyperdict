/**
 * HyperDict — ultra-fast StarDict dictionary engine for the browser.
 *
 * Public entry point for the core (DOM-free) engine. The reusable popup UI
 * lives in a separate entry: `hyperdict/ui` (src/ui.ts).
 *
 * @author Shakeeb Ahmad (https://shakeeb.in)
 * @copyright 2026 Shakeeb Ahmad
 * @license Apache-2.0
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
  ShakeebTypedIndex,
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
export { ShakeebBinarySearch } from './algorithms/binary-search';
export { ShakeebPrefixIndex } from './algorithms/prefix-index';
export { ShakeebBloomFilter } from './algorithms/bloom-filter';
export { ShakeebLRUCache } from './algorithms/lru-cache';

// Parsers
export { ShakeebIdxParser, ShakeebIfoParser } from './index/idx-parser';
export { ShakeebTypedIndexBuilder, TypedIndexReader } from './index/typed-index';

// DictZip
export { ShakeebDictZipHeaderParser } from './dictzip/header-parser';
export { ShakeebBlockReader } from './dictzip/block-reader';
export type { RawInflate } from './dictzip/block-reader';
export { rawInflate } from './dictzip/inflate';

// IO
export { ShakeebRangeFetcher } from './io/range-fetch';
