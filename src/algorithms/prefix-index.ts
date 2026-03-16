/**
 * Prefix Index - First 2 bytes UTF-8 prefix mapping
 * Authored by Shakeeb Ahmad
 *
 * Reduces binary search scope by 1000-10000x
 * Uses first 2 bytes of UTF-8 encoding to map to word ranges
 *
 * Example:
 * - "ab" in English → prefix bytes [0x61, 0x62]
 * - "ع" (Arabic) → prefix bytes [0xD8, 0xB9]
 * - "ک" (Urdu) → prefix bytes [0xDA, 0xA9]
 */

import type { ShaekeebTypedIndex } from '../core/types';

export class ShaekeebPrefixIndex {
  private index: ShaekeebTypedIndex;
  private prefixes: Map<number, { start: number; end: number }> = new Map();
  private decoder: TextDecoder;

  constructor(index: ShaekeebTypedIndex) {
    this.index = index;
    this.decoder = new TextDecoder('utf-8');
    this.buildPrefixIndex();
  }

  /**
   * Build prefix index from all words
   * Stores start and end indices for each prefix
   */
  private buildPrefixIndex(): void {
    let currentPrefix = -1;
    let prefixStart = 0;

    for (let i = 0; i < this.index.wordOffsets.length; i++) {
      const prefix = this.getPrefixKey(i);

      if (prefix !== currentPrefix) {
        // Save previous prefix range
        if (currentPrefix !== -1) {
          this.prefixes.set(currentPrefix, {
            start: prefixStart,
            end: i - 1,
          });
        }

        currentPrefix = prefix;
        prefixStart = i;
      }
    }

    // Save last prefix range
    if (currentPrefix !== -1) {
      this.prefixes.set(currentPrefix, {
        start: prefixStart,
        end: this.index.wordOffsets.length - 1,
      });
    }
  }

  /**
   * Get prefix key (first 2 bytes encoded as single number)
   * Returns -1 if word is too short
   */
  private getPrefixKey(wordIndex: number): number {
    const wordStart = this.index.wordOffsets[wordIndex];

    // Words must be at least 2 bytes
    if (wordStart + 1 >= this.index.wordsBuffer.length) {
      return -1;
    }

    const byte1 = this.index.wordsBuffer[wordStart];
    const byte2 = this.index.wordsBuffer[wordStart + 1];

    // Combine into single 16-bit number
    return (byte1 << 8) | byte2;
  }

  /**
   * Get prefix key from search term
   */
  private getPrefixKeyFromWord(word: string): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(word);

    if (bytes.length < 2) {
      return -1;
    }

    return (bytes[0] << 8) | bytes[1];
  }

  /**
   * Get search range (start and end indices) for a prefix
   * Returns null if prefix not found
   */
  public getSearchRange(word: string): { start: number; end: number } | null {
    const prefixKey = this.getPrefixKeyFromWord(word);

    if (prefixKey === -1) {
      // Single-byte character or empty word
      // Fall back to full range
      return {
        start: 0,
        end: this.index.wordOffsets.length - 1,
      };
    }

    const range = this.prefixes.get(prefixKey);
    return range || null;
  }

  /**
   * Memory usage estimate
   */
  public getMemoryUsage(): number {
    // Rough estimate: ~40 bytes per prefix entry
    return this.prefixes.size * 40;
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalPrefixes: number;
    totalWords: number;
    averageWordsPerPrefix: number;
    memoryUsage: number;
  } {
    const totalWords = this.index.wordOffsets.length;
    return {
      totalPrefixes: this.prefixes.size,
      totalWords,
      averageWordsPerPrefix:
        this.prefixes.size > 0 ? Math.round(totalWords / this.prefixes.size) : 0,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Debug: Print all prefixes
   */
  public debugPrintPrefixes(): void {
    const entries = Array.from(this.prefixes.entries()).sort((a, b) => a[0] - b[0]);

    for (const [key, range] of entries) {
      const byte1 = (key >> 8) & 0xff;
      const byte2 = key & 0xff;

      const charBytes = new Uint8Array([byte1, byte2]);
      const char = this.decoder.decode(charBytes);

      console.log(
        `Prefix 0x${byte1.toString(16).padStart(2, '0')}${byte2.toString(16).padStart(2, '0')} ('${char}'): words ${range.start}-${range.end}`
      );
    }
  }
}
