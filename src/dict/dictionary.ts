/**
 * Dictionary - one loaded StarDict dictionary
 * Authored by Shakeeb Ahmad
 *
 * Owns everything needed to answer lookups for a single dictionary:
 *   - the TypedArray index (.idx) + binary search + prefix index + bloom filter
 *   - the optional synonym table (.syn)
 *   - the dictzip block reader (.dict.dz) for on-demand definition fetching
 *
 * All fetching happens in the async `Dictionary.load()` factory; the instance
 * itself is synchronous for lookups (definition reads stay async because they
 * may hit the network). This keeps the unit DOM-free and worker-portable.
 */

import { ShaekeebIdxParser, ShaekeebIfoParser } from '../index/idx-parser';
import { TypedIndexReader } from '../index/typed-index';
import { ShaekeebBinarySearch } from '../algorithms/binary-search';
import { ShaekeebPrefixIndex } from '../algorithms/prefix-index';
import { ShaekeebBloomFilter } from '../algorithms/bloom-filter';
import { ShaekeebDictZipHeaderParser } from '../dictzip/header-parser';
import { ShaekeebBlockReader, type RawInflate } from '../dictzip/block-reader';
import { ShaekeebRangeFetcher } from '../io/range-fetch';

import type {
  DictionaryConfig,
  DictionaryMetadata,
  ShaekeebTypedIndex,
  DefinitionResult,
  DictZipHeader,
} from '../core/types';

export interface DictionaryDeps {
  /** Raw-DEFLATE inflate (e.g. fflate.inflateSync). */
  inflate: RawInflate;
  /** Decompressed-chunk LRU size. Default 32 (~2 MB). */
  cacheSize?: number;
}

export class Dictionary {
  public readonly name: string;
  public readonly config: DictionaryConfig;
  public readonly metadata: DictionaryMetadata;

  private readonly index: ShaekeebTypedIndex;
  private readonly reader: TypedIndexReader;
  private readonly search: ShaekeebBinarySearch;
  private readonly prefixIndex: ShaekeebPrefixIndex;
  private readonly bloom: ShaekeebBloomFilter;
  private readonly synonyms: Map<string, number> | null;
  private readonly blockReader: ShaekeebBlockReader | null;
  /** Single content type from `sametypesequence` ('' if not declared). */
  private readonly contentType: string;
  private readonly decoder = new TextDecoder('utf-8');

  private constructor(args: {
    config: DictionaryConfig;
    metadata: DictionaryMetadata;
    index: ShaekeebTypedIndex;
    synonyms: Map<string, number> | null;
    blockReader: ShaekeebBlockReader | null;
  }) {
    this.config = args.config;
    this.name = args.config.name;
    this.metadata = args.metadata;
    this.index = args.index;
    this.synonyms = args.synonyms;
    this.blockReader = args.blockReader;
    this.contentType = args.metadata.sametypesequence ?? '';

    this.reader = new TypedIndexReader(args.index);
    this.search = new ShaekeebBinarySearch(args.index);
    this.prefixIndex = new ShaekeebPrefixIndex(args.index);
    this.bloom = new ShaekeebBloomFilter(Math.max(1, args.index.wordOffsets.length));
    for (let i = 0; i < args.index.wordOffsets.length; i++) {
      this.bloom.addBytes(this.reader.getWordBytes(i));
    }
  }

  /**
   * Fetch and build a dictionary from its base path. Loads .ifo + .idx
   * synchronously-critical data, and best-effort loads .syn and .dict.dz
   * (a dictionary without a readable .dict.dz can still answer "exists?").
   */
  public static async load(config: DictionaryConfig, deps: DictionaryDeps): Promise<Dictionary> {
    const base = config.path.endsWith('/') ? config.path : `${config.path}/`;
    const url = (ext: string): string => `${base}${config.name}.${ext}`;

    const ifoParser = new ShaekeebIfoParser();
    const idxParser = new ShaekeebIdxParser();

    const metadata = await ifoParser.parseIfoFromUrl(url('ifo'));
    if (!ifoParser.validate(metadata)) {
      throw new Error(`Invalid .ifo metadata for "${config.name}"`);
    }

    const index = await idxParser.parseIdxFromUrl(url('idx'));

    const synonyms = await Dictionary.tryLoadSynonyms(url('syn'));

    let blockReader: ShaekeebBlockReader | null = null;
    try {
      const header = await Dictionary.loadDictZipHeader(url('dict.dz'));
      blockReader = new ShaekeebBlockReader(url('dict.dz'), header, deps.inflate, deps.cacheSize);
    } catch (err) {
      // Lookups (existence) still work; getDefinition will report the failure.
      console.warn(`[hyperdict] Could not set up .dict.dz for "${config.name}":`, err);
    }

    return new Dictionary({ config, metadata, index, synonyms, blockReader });
  }

  /**
   * Robustly fetch + parse the dictzip header. The RA chunk table can exceed a
   * fixed-size probe for very large dictionaries, so we read XLEN first, then
   * fetch exactly enough bytes to cover the whole gzip header.
   */
  private static async loadDictZipHeader(dictUrl: string): Promise<DictZipHeader> {
    const fetcher = new ShaekeebRangeFetcher(dictUrl);
    const parser = new ShaekeebDictZipHeaderParser();

    // Probe: base header (10) + XLEN (2) + a little slack for FNAME/FCOMMENT.
    const probe = await fetcher.fetchRange(0, 512);
    let headerBytes = probe;

    // If the full extra field + name fields don't fit in the probe, refetch.
    if (probe.length >= 12) {
      const view = new DataView(probe.buffer, probe.byteOffset, probe.byteLength);
      const flags = view.getUint8(3);
      if ((flags & 0x04) !== 0) {
        const xlen = view.getUint16(10, true);
        const needed = 12 + xlen + 512; // extra field + room for name/comment/crc
        if (needed > probe.length) {
          headerBytes = await fetcher.fetchRange(0, needed);
        }
      }
    }

    return parser.parseHeader(headerBytes);
  }

  /**
   * Parse a StarDict .syn file: repeated [word\0][u32 BE index-into-idx].
   * Returns null if absent. Maps each synonym to the .idx entry it points at.
   */
  private static async tryLoadSynonyms(synUrl: string): Promise<Map<string, number> | null> {
    let buffer: ArrayBuffer;
    try {
      const res = await fetch(synUrl);
      if (!res.ok) {
        return null;
      }
      buffer = await res.arrayBuffer();
    } catch {
      return null;
    }

    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const decoder = new TextDecoder('utf-8');
    const map = new Map<string, number>();
    let offset = 0;

    while (offset < bytes.length) {
      let end = offset;
      while (end < bytes.length && bytes[end] !== 0) {
        end++;
      }
      // Need the NUL at `end` plus 4 bytes of big-endian index after it.
      if (end + 5 > bytes.length) {
        break;
      }
      const word = decoder.decode(bytes.subarray(offset, end));
      const idx = view.getUint32(end + 1, false); // big-endian
      map.set(word, idx);
      offset = end + 5;
    }

    return map.size > 0 ? map : null;
  }

  // --- lookups -------------------------------------------------------------

  /** Exact headword lookup (bloom → prefix range → bounded binary search). */
  public findIndex(word: string): number {
    if (!this.bloom.mightContain(word)) {
      return -1;
    }
    const range = this.prefixIndex.getSearchRange(word);
    if (!range) {
      return -1;
    }
    return this.search.findWordInRange(word, range.start, range.end);
  }

  /**
   * Resolve a query to an index entry, trying (in order): exact headword,
   * case-insensitive match for ASCII queries, then the synonym table.
   * Returns -1 if the word is in no form present.
   */
  public resolve(word: string): number {
    const direct = this.findIndex(word);
    if (direct !== -1) {
      return direct;
    }

    // Case-insensitive fallback (StarDict often sorts ASCII case-insensitively).
    if (/[A-Za-z]/.test(word)) {
      const ci = this.search.findWordCaseInsensitive(word);
      if (ci !== -1) {
        return ci;
      }
    }

    if (this.synonyms) {
      const synIdx = this.synonyms.get(word);
      if (synIdx !== undefined && synIdx < this.index.wordOffsets.length) {
        return synIdx;
      }
    }

    return -1;
  }

  public has(word: string): boolean {
    return this.resolve(word) !== -1;
  }

  /** The canonical headword for an index entry (useful when resolving synonyms). */
  public headwordAt(index: number): string {
    return this.search.getWord(index);
  }

  /**
   * Fetch + decode the definition for a word. Returns null if the word is not
   * present in this dictionary. Throws only on a real I/O/decompression failure.
   */
  public async getDefinition(word: string): Promise<DefinitionResult | null> {
    const idx = this.resolve(word);
    if (idx === -1) {
      return null;
    }

    if (!this.blockReader) {
      throw new Error(`Dictionary "${this.name}" has no readable .dict.dz`);
    }

    const offset = this.index.offsetArray[idx];
    const length = this.index.lengthArray[idx];
    const raw = await this.blockReader.readBytes(offset, length);
    const { type, text } = this.decodePayload(raw);

    return { word: this.search.getWord(idx), definition: text, dictName: this.name, type };
  }

  /**
   * Decode a definition payload into {type, text} honoring `sametypesequence`.
   * - single-char sametypesequence (the common case, e.g. 'h'): whole payload
   *   is that type.
   * - no sametypesequence: first byte is the type char, the rest is the data
   *   (trailing NUL stripped) — covers single-field entries.
   * - multi-char sametypesequence: best-effort, decode as the first type.
   */
  private decodePayload(bytes: Uint8Array): { type: string; text: string } {
    if (this.contentType.length === 1) {
      return { type: this.contentType, text: this.decoder.decode(bytes) };
    }

    if (this.contentType.length === 0 && bytes.length > 0) {
      const type = String.fromCharCode(bytes[0]);
      let payload = bytes.subarray(1);
      if (payload.length > 0 && payload[payload.length - 1] === 0) {
        payload = payload.subarray(0, payload.length - 1);
      }
      return { type, text: this.decoder.decode(payload) };
    }

    // Multi-char sametypesequence: structured multi-field entries are rare for
    // the dictionaries we target; decode the whole block under the first type.
    return { type: this.contentType.charAt(0) || 'm', text: this.decoder.decode(bytes) };
  }

  // --- introspection -------------------------------------------------------

  public get wordCount(): number {
    return this.index.wordOffsets.length;
  }

  public get hasDefinitions(): boolean {
    return this.blockReader !== null;
  }

  public getMemoryUsage(): number {
    let mem =
      this.index.wordsBuffer.byteLength +
      this.index.wordOffsets.byteLength +
      this.index.offsetArray.byteLength +
      this.index.lengthArray.byteLength;
    mem += this.bloom.getMemoryUsage();
    mem += this.prefixIndex.getMemoryUsage();
    return mem;
  }
}
