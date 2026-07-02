/**
 * IDX Parser - Parse StarDict .idx files
 * Authored by Shakeeb Ahmad
 *
 * StarDict .idx file format:
 * - Multiple variable-length entries
 * - Each entry: [word]\0 [offset:4bytes big-endian] [size:4bytes big-endian]
 */

import type { DictionaryMetadata, ShaekeebTypedIndex } from '../core/types';

export class ShaekeebIdxParser {
  /**
   * Parse a .idx buffer directly into a TypedIndex — no intermediate strings.
   *
   * Each entry is `word\0` + u32 BE offset + u32 BE size (9 header bytes after
   * the word). We do two passes: pass 1 counts entries and total word bytes so
   * we can allocate exact-size TypedArrays; pass 2 copies the raw UTF-8 word
   * bytes straight into `wordsBuffer` and reads the offset/size. The old code
   * decoded each word to a JS string and then re-encoded it in the builder —
   * ~2 TextCodec ops + a throwaway string per word (≈half a second for a 237k
   * dictionary). Copying bytes directly removes all of that.
   *
   * Accepts an ArrayBuffer (network) or a Uint8Array (e.g. extracted from a zip).
   */
  public parseIdx(input: ArrayBuffer | Uint8Array): ShaekeebTypedIndex {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.byteLength;

    // Pass 1: count entries and sum word-byte lengths.
    let count = 0;
    let wordBytesTotal = 0;
    let off = 0;
    while (off < len) {
      let end = off;
      while (end < len && bytes[end] !== 0) {
        end++;
      }
      if (end + 9 > len) {
        break; // NUL(1) + offset(4) + size(4)
      }
      count++;
      wordBytesTotal += end - off;
      off = end + 9;
    }

    const wordsBuffer = new Uint8Array(wordBytesTotal);
    const wordOffsets = new Uint32Array(count);
    const offsetArray = new Uint32Array(count);
    const lengthArray = new Uint32Array(count);

    // Pass 2: copy word bytes + read offset/size.
    off = 0;
    let wi = 0;
    let wb = 0;
    while (off < len && wi < count) {
      let end = off;
      while (end < len && bytes[end] !== 0) {
        end++;
      }
      if (end + 9 > len) {
        break;
      }
      wordOffsets[wi] = wb;
      wordsBuffer.set(bytes.subarray(off, end), wb);
      wb += end - off;
      offsetArray[wi] = view.getUint32(end + 1, false); // BE file offset
      lengthArray[wi] = view.getUint32(end + 5, false); // BE definition size
      wi++;
      off = end + 9;
    }

    return { wordsBuffer, wordOffsets, offsetArray, lengthArray };
  }

  /**
   * Parse .idx file from URL using fetch
   */
  public async parseIdxFromUrl(url: string): Promise<ShaekeebTypedIndex> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return this.parseIdx(buffer);
  }
}

/**
 * IFO Parser - Parse StarDict .ifo metadata files
 */
export class ShaekeebIfoParser {
  private decoder: TextDecoder;

  constructor() {
    this.decoder = new TextDecoder('utf-8');
  }

  /**
   * Parse .ifo file buffer into metadata.
   * Accepts an ArrayBuffer (network) or a Uint8Array (e.g. extracted from a zip).
   */
  public parseIfo(buffer: ArrayBuffer | Uint8Array): DictionaryMetadata {
    const text = this.decoder.decode(buffer);
    const lines = text.split('\n');
    const metadata: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, eqIndex).toLowerCase();
      const value = trimmed.substring(eqIndex + 1);

      metadata[key] = value;
    }

    return {
      version: metadata['stardict dictionary format version'] || '',
      bookname: metadata['bookname'] || '',
      wordcount: parseInt(metadata['wordcount'] || '0', 10),
      synwordcount: metadata['synwordcount'] ? parseInt(metadata['synwordcount'], 10) : undefined,
      idxfilesize: parseInt(metadata['idxfilesize'] || '0', 10),
      dicttype: metadata['dicttype'],
      author: metadata['author'],
      email: metadata['email'],
      website: metadata['website'],
      description: metadata['description'],
      date: metadata['date'],
      sametypesequence: metadata['sametypesequence'],
      idxoffsetbits: metadata['idxoffsetbits']
        ? parseInt(metadata['idxoffsetbits'], 10)
        : undefined,
    };
  }

  /**
   * Parse .ifo file from URL
   */
  public async parseIfoFromUrl(url: string): Promise<DictionaryMetadata> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return this.parseIfo(buffer);
  }

  /**
   * Validate metadata
   */
  public validate(metadata: DictionaryMetadata): boolean {
    if (!metadata.bookname) {
      return false;
    }

    if (metadata.wordcount <= 0) {
      return false;
    }

    if (metadata.idxfilesize <= 0) {
      return false;
    }

    return true;
  }
}
