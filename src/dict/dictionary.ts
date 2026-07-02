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
import { unzipSync } from 'fflate';

import { ShaekeebDictZipHeaderParser } from '../dictzip/header-parser';
import { ShaekeebBlockReader, type RawInflate } from '../dictzip/block-reader';
import { fetchBuffer } from '../io/cached-fetch';
import { HttpByteSource, BufferByteSource, type ByteSource } from '../io/byte-source';
import { PlainDictReader, type ContentReader } from './content-reader';
import { stripDiacritics } from './normalize';

import type {
  DictionaryConfig,
  DictionaryFiles,
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
  /** Cache whole-file fetches (.ifo/.idx/.syn) in Cache Storage across reloads. */
  persist?: boolean;
  /** Max cached resolved definitions per dictionary. Default 300. */
  defCacheSize?: number;
  /** Build a Bloom filter (extra load cost for O(1) negatives). Default false. */
  useBloom?: boolean;
  /**
   * Build a diacritic-normalized headword map for bidirectional
   * diacritic-insensitive lookup (finds diacritic-bearing headwords from a bare
   * query). Costs a full-corpus decode+strip pass at load, so default false —
   * query-side diacritic stripping works without it.
   */
  normalize?: boolean;
  /** Download whole content files up front (offline mode). Default false. */
  preload?: boolean;
}

/**
 * Resolve a config to concrete file URLs. Explicit `files` win; otherwise the
 * files are assumed to live at `<path><basename>.ext` (basename defaults to name).
 */
export function resolveFiles(config: DictionaryConfig): DictionaryFiles {
  if (config.files) {
    return config.files;
  }
  if (!config.path) {
    throw new Error(`Dictionary "${config.name}" needs either files{} or a path`);
  }
  const base = config.path.endsWith('/') ? config.path : `${config.path}/`;
  const bn = config.basename ?? config.name;
  return {
    ifo: `${base}${bn}.ifo`,
    idx: `${base}${bn}.idx`,
    dict: `${base}${bn}.dict.dz`,
    syn: `${base}${bn}.syn`,
  };
}

export class Dictionary {
  public readonly name: string;
  public readonly config: DictionaryConfig;
  public readonly metadata: DictionaryMetadata;

  private readonly index: ShaekeebTypedIndex;
  private readonly reader: TypedIndexReader;
  private readonly search: ShaekeebBinarySearch;
  private readonly prefixIndex: ShaekeebPrefixIndex;
  private readonly bloom: ShaekeebBloomFilter | null;
  private readonly synonyms: Map<string, number> | null;
  /** stripped-headword → index, for diacritic-bearing headwords (opt-in). */
  private readonly diacriticMap: Map<string, number> | null;
  private readonly contentReader: ContentReader | null;
  /** Single content type from `sametypesequence` ('' if not declared). */
  private readonly contentType: string;
  private readonly decoder = new TextDecoder('utf-8');
  /** Resolved-definition cache (headword -> result), bounded LRU. */
  private readonly defCache = new Map<string, DefinitionResult>();
  private readonly defCacheMax: number;

  private constructor(args: {
    config: DictionaryConfig;
    metadata: DictionaryMetadata;
    index: ShaekeebTypedIndex;
    synonyms: Map<string, number> | null;
    contentReader: ContentReader | null;
    defCacheMax: number;
    useBloom: boolean;
    normalize: boolean;
  }) {
    this.config = args.config;
    this.name = args.config.name;
    this.metadata = args.metadata;
    this.index = args.index;
    this.synonyms = args.synonyms;
    this.contentReader = args.contentReader;
    this.defCacheMax = args.defCacheMax;
    this.contentType = args.metadata.sametypesequence ?? '';

    this.reader = new TypedIndexReader(args.index);
    this.search = new ShaekeebBinarySearch(args.index);
    this.prefixIndex = new ShaekeebPrefixIndex(args.index);

    // The Bloom filter is optional: prefix + binary search already give
    // O(log n) negatives, and building the filter is a full-corpus hashing pass
    // we'd rather skip on large dictionaries / low-end devices.
    if (args.useBloom) {
      this.bloom = new ShaekeebBloomFilter(Math.max(1, args.index.wordOffsets.length));
      for (let i = 0; i < args.index.wordOffsets.length; i++) {
        this.bloom.addBytes(this.reader.getWordBytes(i));
      }
    } else {
      this.bloom = null;
    }

    // Optional: map stripped forms of diacritic-bearing headwords → index, so a
    // bare query can find a headword that carries diacritics. Only diacritic
    // headwords are stored, so the map stays small even for large dictionaries.
    if (args.normalize) {
      this.diacriticMap = new Map<string, number>();
      for (let i = 0; i < args.index.wordOffsets.length; i++) {
        const raw = this.search.getWord(i);
        const bare = stripDiacritics(raw);
        if (bare !== raw && !this.diacriticMap.has(bare)) {
          this.diacriticMap.set(bare, i);
        }
      }
    } else {
      this.diacriticMap = null;
    }
  }

  /**
   * Fetch and build a dictionary. Three source shapes are supported:
   *   - `archive`: one .zip holding all files (downloaded + unzipped in memory)
   *   - explicit `files`: exact URLs for each file
   *   - `path`: files named `<basename>.ext` under a folder URL
   *
   * The content file may be dictzip (`.dict.dz`) or an uncompressed `.dict`. A
   * dictionary whose content is unreadable still answers "exists?" queries.
   */
  public static async load(config: DictionaryConfig, deps: DictionaryDeps): Promise<Dictionary> {
    const ifoParser = new ShaekeebIfoParser();
    const idxParser = new ShaekeebIdxParser();
    const defCacheMax = deps.defCacheSize ?? 300;

    if (config.archive) {
      return Dictionary.loadFromArchive(config, deps, ifoParser, idxParser, defCacheMax);
    }

    const files = resolveFiles(config);
    const persist = deps.persist;

    const metadata = ifoParser.parseIfo(await fetchBuffer(files.ifo, { persist }));
    if (!ifoParser.validate(metadata)) {
      throw new Error(`Invalid .ifo metadata for "${config.name}"`);
    }
    Dictionary.assertSupported(config.name, metadata);

    const index = idxParser.parseIdx(await fetchBuffer(files.idx, { persist }));

    // Only attempt .syn when explicitly provided, or when using the path form
    // (where the URL is a best-effort guess that may legitimately 404).
    const synUrl = config.files ? config.files.syn : files.syn;
    const synonyms = synUrl ? await Dictionary.tryLoadSynonyms(synUrl, persist) : null;

    // Content candidates: an explicit URL as given, or (path form) .dict.dz then .dict.
    const candidates = config.files
      ? [config.files.dict]
      : [files.dict, files.dict.replace(/\.dz$/i, '')];
    const preload = config.preload ?? deps.preload ?? false;
    const contentReader = await Dictionary.buildHttpContentReader(
      candidates,
      config.name,
      deps,
      preload
    );

    return new Dictionary({
      config,
      metadata,
      index,
      synonyms,
      contentReader,
      defCacheMax,
      useBloom: deps.useBloom ?? false,
      normalize: deps.normalize ?? false,
    });
  }

  /**
   * Reject dictionaries HyperDict can't parse correctly. 64-bit idx offsets use
   * 8-byte fields; our parser and Uint32 offset arrays assume 32-bit, so a
   * 64-bit dictionary would parse into garbage — fail loudly instead.
   */
  private static assertSupported(name: string, metadata: DictionaryMetadata): void {
    if (metadata.idxoffsetbits && metadata.idxoffsetbits !== 32) {
      throw new Error(
        `Dictionary "${name}" uses idxoffsetbits=${metadata.idxoffsetbits}; only 32-bit offsets are supported.`
      );
    }
  }

  /** Load everything from a single in-memory .zip archive. */
  private static async loadFromArchive(
    config: DictionaryConfig,
    deps: DictionaryDeps,
    ifoParser: ShaekeebIfoParser,
    idxParser: ShaekeebIdxParser,
    defCacheMax: number
  ): Promise<Dictionary> {
    const archiveBytes = new Uint8Array(
      await fetchBuffer(config.archive as string, { persist: deps.persist })
    );

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(archiveBytes);
    } catch (e) {
      throw new Error(`Failed to unzip archive for "${config.name}": ${String(e)}`);
    }

    const pick = (ext: string): Uint8Array | null => {
      const key = Object.keys(entries).find((k) => k.toLowerCase().endsWith(ext));
      return key ? entries[key] : null;
    };

    const ifoBytes = pick('.ifo');
    const idxBytes = pick('.idx');
    if (!ifoBytes || !idxBytes) {
      throw new Error(`Archive for "${config.name}" is missing a .ifo or .idx file`);
    }

    const metadata = ifoParser.parseIfo(ifoBytes);
    if (!ifoParser.validate(metadata)) {
      throw new Error(`Invalid .ifo metadata in archive for "${config.name}"`);
    }
    Dictionary.assertSupported(config.name, metadata);
    const index = idxParser.parseIdx(idxBytes);

    const synBytes = pick('.syn');
    const synonyms = synBytes ? Dictionary.parseSynonyms(synBytes) : null;

    let contentReader: ContentReader | null = null;
    const dzBytes = pick('.dict.dz');
    if (dzBytes) {
      try {
        const source = new BufferByteSource(dzBytes);
        const header = await Dictionary.loadDictZipHeader(source);
        contentReader = new ShaekeebBlockReader(source, header, deps.inflate, deps.cacheSize);
      } catch (e) {
        console.warn(`[hyperdict] Bad .dict.dz inside archive for "${config.name}":`, e);
      }
    } else {
      const plainBytes = pick('.dict');
      if (plainBytes) {
        contentReader = new PlainDictReader(new BufferByteSource(plainBytes));
      }
    }
    if (!contentReader) {
      console.warn(
        `[hyperdict] Archive for "${config.name}" has no readable .dict/.dict.dz; definitions unavailable`
      );
    }

    return new Dictionary({
      config,
      metadata,
      index,
      synonyms,
      contentReader,
      defCacheMax,
      useBloom: deps.useBloom ?? false,
      normalize: deps.normalize ?? false,
    });
  }

  /**
   * Build a content reader for the first usable candidate URL. `.dict.dz` URLs
   * are read as dictzip; anything else is treated as an uncompressed `.dict`,
   * which requires HTTP Range support (otherwise a read would download the whole
   * file). Returns null if no candidate is usable (existence lookups still work).
   */
  private static async buildHttpContentReader(
    candidates: string[],
    name: string,
    deps: DictionaryDeps,
    preload: boolean
  ): Promise<ContentReader | null> {
    for (const url of candidates) {
      const isDz = /\.dz(\?|$)/i.test(url);
      try {
        if (preload) {
          // Offline mode: pull the whole file once (cached if persist), then
          // read from memory — no range requests, no Range-support requirement.
          const bytes = new Uint8Array(await fetchBuffer(url, { persist: deps.persist }));
          const source = new BufferByteSource(bytes);
          if (isDz) {
            const header = await Dictionary.loadDictZipHeader(source);
            return new ShaekeebBlockReader(source, header, deps.inflate, deps.cacheSize);
          }
          return new PlainDictReader(source);
        }

        const source = new HttpByteSource(url);
        if (isDz) {
          const header = await Dictionary.loadDictZipHeader(source);
          return new ShaekeebBlockReader(source, header, deps.inflate, deps.cacheSize);
        }
        if (await Dictionary.serverSupportsRange(url)) {
          return new PlainDictReader(source);
        }
      } catch {
        // Try the next candidate.
      }
    }
    console.warn(`[hyperdict] No readable .dict/.dict.dz for "${name}"; definitions unavailable`);
    return null;
  }

  /** HEAD-free Range probe that avoids buffering a large 200 (no-range) body. */
  private static async serverSupportsRange(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-1' } });
      const ok = res.status === 206;
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      if (!ok && res.status === 200) {
        console.warn(
          `[hyperdict] ${url} ignored Range (status 200); an uncompressed .dict needs Range support`
        );
      }
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * Robustly parse the dictzip header from a ByteSource. The RA chunk table can
   * exceed a fixed-size probe for large dictionaries, so we read XLEN first, then
   * read exactly enough bytes to cover the whole gzip header.
   */
  private static async loadDictZipHeader(source: ByteSource): Promise<DictZipHeader> {
    const parser = new ShaekeebDictZipHeaderParser();

    // Probe: base header (10) + XLEN (2) + a little slack for FNAME/FCOMMENT.
    const probe = await source.read(0, 512);
    let headerBytes = probe;

    if (probe.length >= 12) {
      const view = new DataView(probe.buffer, probe.byteOffset, probe.byteLength);
      const flags = view.getUint8(3);
      if ((flags & 0x04) !== 0) {
        const xlen = view.getUint16(10, true);
        const needed = 12 + xlen + 512; // extra field + room for name/comment/crc
        if (needed > probe.length) {
          headerBytes = await source.read(0, needed);
        }
      }
    }

    return parser.parseHeader(headerBytes);
  }

  /** Fetch + parse a StarDict .syn file. Returns null if absent/unreadable. */
  private static async tryLoadSynonyms(
    synUrl: string,
    persist?: boolean
  ): Promise<Map<string, number> | null> {
    try {
      const buffer = await fetchBuffer(synUrl, { persist });
      return Dictionary.parseSynonyms(new Uint8Array(buffer));
    } catch {
      return null;
    }
  }

  /**
   * Parse a StarDict .syn buffer: repeated [word\0][u32 BE index-into-idx].
   * Maps each synonym to the .idx entry it points at. Null if empty.
   */
  private static parseSynonyms(bytes: Uint8Array): Map<string, number> | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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

  /** Exact headword lookup (optional bloom → prefix range → bounded binary search). */
  public findIndex(word: string): number {
    if (this.bloom && !this.bloom.mightContain(word)) {
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

    // Case-insensitive fallback for ASCII queries. StarDict's default collation
    // (g_ascii_strcasecmp) sorts ASCII case-insensitively, so this is an
    // O(log n) binary search — not the old O(n) full scan.
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

    // Diacritic-insensitive fallback. Query-side stripping (free) matches a bare
    // headword when the query carried harakat; the opt-in map matches a
    // diacritic-bearing headword from a bare query.
    const bare = stripDiacritics(word);
    if (bare !== word) {
      const viaBareQuery = this.findIndex(bare);
      if (viaBareQuery !== -1) {
        return viaBareQuery;
      }
    }
    if (this.diacriticMap) {
      const viaMap = this.diacriticMap.get(bare);
      if (viaMap !== undefined) {
        return viaMap;
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

    const headword = this.search.getWord(idx);

    // Serve from the resolved-definition cache when possible (network-free).
    const cached = this.defCache.get(headword);
    if (cached) {
      this.defCache.delete(headword);
      this.defCache.set(headword, cached); // bump to most-recent
      return cached;
    }

    if (!this.contentReader) {
      throw new Error(`Dictionary "${this.name}" has no readable .dict/.dict.dz`);
    }

    const offset = this.index.offsetArray[idx];
    const length = this.index.lengthArray[idx];
    const raw = await this.contentReader.readBytes(offset, length);
    const { type, text } = this.decodePayload(raw);

    const result: DefinitionResult = {
      word: headword,
      definition: text,
      dictName: this.name,
      type,
    };

    this.defCache.set(headword, result);
    if (this.defCache.size > this.defCacheMax) {
      const oldest = this.defCache.keys().next().value;
      if (oldest !== undefined) {
        this.defCache.delete(oldest);
      }
    }
    return result;
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
    return this.contentReader !== null;
  }

  public getMemoryUsage(): number {
    let mem =
      this.index.wordsBuffer.byteLength +
      this.index.wordOffsets.byteLength +
      this.index.offsetArray.byteLength +
      this.index.lengthArray.byteLength;
    if (this.bloom) mem += this.bloom.getMemoryUsage();
    mem += this.prefixIndex.getMemoryUsage();
    return mem;
  }
}
