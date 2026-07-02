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
  /** Bits per .idx offset field: 32 (default) or 64. HyperDict supports 32. */
  idxoffsetbits?: number;
}

/**
 * Explicit URLs for a dictionary's StarDict files.
 * `.ifo`, `.idx`, `.dict` (the .dict.dz) are required; `.syn` is optional.
 */
export interface DictionaryFiles {
  ifo: string;
  idx: string;
  dict: string;
  syn?: string;
}

/**
 * Dictionary configuration for registration.
 *
 * Provide EITHER explicit `files` (most robust — the Manage UI uses this) OR a
 * `path` folder plus optional `basename` (convenience: files are assumed to be
 * `<path><basename>.ext`, with basename defaulting to `name`).
 *
 * The remaining fields are UI hints consumed by the popup layer; the core
 * engine ignores them.
 */
export interface DictionaryConfig {
  name: string;
  /** Base folder URL (files named `<basename>.ext`). */
  path?: string;
  /** Basename of the files under `path`. Defaults to `name`. */
  basename?: string;
  /** Explicit file URLs. Takes precedence over `path`/`basename`. */
  files?: DictionaryFiles;
  /**
   * URL of a single `.zip` archive containing all files (`.ifo`, `.idx`,
   * `.dict`/`.dict.dz`, optional `.syn`). Takes precedence over everything.
   * NOTE: the whole archive is downloaded and decompressed into memory (no
   * range reads), so this trades memory for one request — best for smaller
   * dictionaries or bundled/offline use.
   */
  archive?: string;

  /**
   * Download the whole content file (`.dict.dz`/`.dict`) up front instead of
   * range-reading. With engine `persist`, the full dictionary is cached to the
   * device for offline use. Overrides the engine-level `preload` option.
   */
  preload?: boolean;

  // --- UI hints (optional) ---
  /** Human-readable tab label. Defaults to `name`. */
  label?: string;
  /** BCP-47-ish language tag, e.g. 'ur', 'en'. */
  lang?: string;
  /** Text direction for words/definitions. Auto-detected if omitted. */
  dir?: 'rtl' | 'ltr';
  /** CSS font-family to apply to definitions (e.g. 'Noto Nastaliq Urdu'). */
  font?: string;
  /** Stylesheet URL to inject for `font` (e.g. a Google Fonts link). */
  fontUrl?: string;
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
  /**
   * StarDict content type of the definition payload.
   * Common values: 'h' = HTML, 'm' = plain UTF-8 text, 'g' = Pango/markup,
   * 'x' = xdxf. Determined from `sametypesequence` or the per-entry type prefix.
   * UI uses this to decide whether to render as HTML or escape as text.
   */
  type?: string;
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
 * DictZip header information (parsed from the gzip RA extra field).
 *
 * A dictzip file is a normal gzip stream whose payload is split into fixed-size
 * UNCOMPRESSED chunks (`chunkLength` bytes each, except possibly the last). Each
 * chunk is an independent raw-DEFLATE stream, so any chunk can be inflated in
 * isolation for random access. The RA extra field stores the COMPRESSED length
 * of every chunk; absolute compressed offsets are the running sum of those
 * lengths starting at `dataStart`.
 */
export interface DictZipHeader {
  /** Uncompressed bytes per chunk (CHLEN). Typically 58315. */
  chunkLength: number;
  /** Number of chunks (CHCNT). */
  chunkCount: number;
  /** Compressed byte length of each chunk (CHCNT entries). */
  chunkCompLengths: Uint32Array;
  /**
   * Absolute compressed start offset of each chunk within the .dict.dz file.
   * cumOffsets[i] = dataStart + Σ chunkCompLengths[0..i-1].
   */
  cumOffsets: Uint32Array;
  /** Byte offset where compressed chunk data begins (after the full gzip header). */
  dataStart: number;
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
