/**
 * IDX Parser - Parse StarDict .idx files
 * Authored by Shakeeb Ahmad
 *
 * StarDict .idx file format:
 * - Multiple variable-length entries
 * - Each entry: [word]\0 [offset:4bytes big-endian] [size:4bytes big-endian]
 */

import { ShaekeebTypedIndexBuilder } from './typed-index';
import type { DictionaryMetadata } from '../core/types';

export class ShaekeebIdxParser {
  private decoder: TextDecoder;

  constructor() {
    this.decoder = new TextDecoder('utf-8');
  }

  /**
   * Parse .idx file buffer into TypedIndex structure
   * Returns built index ready for binary search
   */
  public parseIdx(buffer: ArrayBuffer): ReturnType<ShaekeebTypedIndexBuilder['build']> {
    const view = new DataView(buffer);
    const builder = new ShaekeebTypedIndexBuilder();
    let offset = 0;

    while (offset < view.byteLength) {
      // Read null-terminated word
      const wordStart = offset;
      let wordEnd = offset;

      // Find null terminator
      while (wordEnd < view.byteLength && view.getUint8(wordEnd) !== 0) {
        wordEnd++;
      }

      if (wordEnd >= view.byteLength) {
        break; // Malformed entry
      }

      // Decode word
      const wordBytes = new Uint8Array(buffer, wordStart, wordEnd - wordStart);
      const word = this.decoder.decode(wordBytes);

      offset = wordEnd + 1; // Skip null terminator

      // Check if we have enough bytes for offset and length
      if (offset + 8 > view.byteLength) {
        break;
      }

      // Read file offset (4 bytes, big-endian)
      const fileOffset = view.getUint32(offset, false);
      offset += 4;

      // Read definition length (4 bytes, big-endian)
      const length = view.getUint32(offset, false);
      offset += 4;

      builder.addEntry(word, fileOffset, length);
    }

    return builder.build();
  }

  /**
   * Parse .idx file from URL using fetch
   */
  public async parseIdxFromUrl(
    url: string
  ): Promise<ReturnType<ShaekeebTypedIndexBuilder['build']>> {
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
   * Parse .ifo file buffer into metadata
   */
  public parseIfo(buffer: ArrayBuffer): DictionaryMetadata {
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
