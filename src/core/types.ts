/**
 * Type definitions for HyperDict core data structures
 * Authored by Shakeeb Ahmad
 */

/**
 * Typed index structures using SharedArrayBuffer for worker access
 * Provides ultra-fast lookup without copying data to worker
 */
export interface ShaekeebTypedIndex {
  wordsBuffer: Uint8Array; // Raw UTF-8 encoded words
  wordOffsets: Uint32Array; // Offset of each word in wordsBuffer
  offsetArray: Uint32Array; // File offset for each word in .dict file
  lengthArray: Uint32Array; // Length of each word definition
  sharedBuffer?: SharedArrayBuffer; // Optional: for worker access
}

/**
 * Dictionary entry structure
 */
export interface DictionaryEntry {
  word: string;
  definition: string;
  offset: number;
  length: number;
}

/**
 * Dictionary metadata from .ifo file
 */
export interface DictionaryMetadata {
  version: string;
  bookname: string;
  wordcount: number;
  synwordcount?: number;
  idxfilesize: number;
  dicttype?: string;
  author?: string;
  email?: string;
  website?: string;
  description?: string;
  date?: string;
  sametypesequence?: string;
}

/**
 * Dictionary configuration for registration
 */
export interface DictionaryConfig {
  name: string;
  path: string;
}

/**
 * Result from lookup operation
 */
export interface LookupResult {
  word: string;
  dictionaries: Array<{
    name: string;
    found: boolean;
  }>;
}

/**
 * Definition result from a specific dictionary
 */
export interface DefinitionResult {
  word: string;
  definition: string;
  dictName: string;
}

/**
 * Cached block in LRU cache
 */
export interface CachedBlock {
  blockIndex: number;
  data: Uint8Array;
  timestamp: number;
}

/**
 * DictZip header information
 */
export interface DictZipHeader {
  blockSize: number;
  blockOffsets: Uint32Array;
  totalBlocks: number;
}

/**
 * Prefix index mapping first 2 UTF-8 bytes to word offsets
 */
export interface PrefixIndexShakeeb {
  prefixes: Map<number, Uint32Array>; // Map of 2-byte prefix to word indices
  totalWords: number;
}

/**
 * Worker message types
 */
export interface WorkerMessage {
  type:
    | 'lookup'
    | 'getDefinition'
    | 'init'
    | 'registerDictionary'
    | 'getWord'
    | 'getEntryMetadata'
    | 'getDictionaries';
  payload: Record<string, unknown>;
}

/**
 * Worker response types
 */
export interface WorkerResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
