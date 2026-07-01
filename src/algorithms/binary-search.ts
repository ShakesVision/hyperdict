/**
 * Binary Search - Ultra-optimized for TypedArray word search
 * Authored by Shakeeb Ahmad
 *
 * Core optimization: Avoid string creation during search
 * - Compare bytes directly from wordsBuffer
 * - Only decode when match found
 * - Works with UTF-8 encoded bytes
 */

import type { ShaekeebTypedIndex } from '../core/types';

export class ShaekeebBinarySearch {
  private index: ShaekeebTypedIndex;
  private encoder: TextEncoder;
  private decoder: TextDecoder;

  constructor(index: ShaekeebTypedIndex) {
    this.index = index;
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder('utf-8');
  }

  /**
   * Find exact word match in index
   * Returns word index if found, -1 if not found
   */
  public findWord(searchWord: string): number {
    const searchBytes = this.encoder.encode(searchWord);
    return this.binarySearchBytes(searchBytes);
  }

  /**
   * Find an exact word match within a bounded index range [start, end]
   * (inclusive). Used together with the prefix index to shrink the search
   * window. Returns the word index, or -1 if not found.
   */
  public findWordInRange(searchWord: string, start: number, end: number): number {
    const searchBytes = this.encoder.encode(searchWord);
    let left = Math.max(0, start);
    let right = Math.min(this.index.wordOffsets.length - 1, end);

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const cmp = this.compareWordAtIndex(mid, searchBytes);

      if (cmp === 0) {
        return mid;
      } else if (cmp < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return -1;
  }

  /**
   * Low-level binary search using byte arrays
   * Avoids string creation for performance
   */
  private binarySearchBytes(searchBytes: Uint8Array): number {
    let left = 0;
    let right = this.index.wordOffsets.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = this.compareWordAtIndex(mid, searchBytes);

      if (cmp === 0) {
        return mid; // Found
      } else if (cmp < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return -1; // Not found
  }

  /**
   * Compare word at index with search bytes
   * Returns: -1 if word < search, 0 if equal, 1 if word > search
   */
  private compareWordAtIndex(wordIndex: number, searchBytes: Uint8Array): number {
    const wordStart = this.index.wordOffsets[wordIndex];
    const wordEnd =
      wordIndex + 1 < this.index.wordOffsets.length
        ? this.index.wordOffsets[wordIndex + 1]
        : this.index.wordsBuffer.length;

    const wordBytes = this.index.wordsBuffer.slice(wordStart, wordEnd);

    return this.compareByteArrays(wordBytes, searchBytes);
  }

  /**
   * Compare two byte arrays
   * Uses byte-by-byte comparison for proper UTF-8 handling
   */
  private compareByteArrays(a: Uint8Array, b: Uint8Array): number {
    const minLen = Math.min(a.length, b.length);

    for (let i = 0; i < minLen; i++) {
      if (a[i] < b[i]) {
        return -1;
      }
      if (a[i] > b[i]) {
        return 1;
      }
    }

    // If one is a prefix of the other
    if (a.length < b.length) {
      return -1;
    }
    if (a.length > b.length) {
      return 1;
    }

    return 0;
  }

  /**
   * Find all words with given prefix (case-sensitive)
   * Returns array of word indices
   */
  public findPrefix(prefix: string): number[] {
    const prefixBytes = this.encoder.encode(prefix);
    const results: number[] = [];

    // Find first word starting with prefix using binary search
    const firstIndex = this.findFirstWithPrefix(prefixBytes);
    if (firstIndex === -1) {
      return results;
    }

    // Collect all matching words
    for (let i = firstIndex; i < this.index.wordOffsets.length; i++) {
      if (this.wordStartsWithPrefix(i, prefixBytes)) {
        results.push(i);
      } else {
        break; // Since index is sorted, we can stop
      }
    }

    return results;
  }

  /**
   * Binary search to find first word starting with prefix
   */
  private findFirstWithPrefix(prefixBytes: Uint8Array): number {
    let left = 0;
    let right = this.index.wordOffsets.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      if (this.wordStartsWithPrefix(mid, prefixBytes)) {
        result = mid;
        right = mid - 1; // Continue searching left for earlier matches
      } else {
        const cmp = this.compareWordAtIndex(mid, prefixBytes);
        if (cmp < 0) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }

    return result;
  }

  /**
   * Check if word at index starts with prefix bytes
   */
  private wordStartsWithPrefix(wordIndex: number, prefixBytes: Uint8Array): boolean {
    const wordStart = this.index.wordOffsets[wordIndex];
    const wordEnd =
      wordIndex + 1 < this.index.wordOffsets.length
        ? this.index.wordOffsets[wordIndex + 1]
        : this.index.wordsBuffer.length;

    if (wordEnd - wordStart < prefixBytes.length) {
      return false;
    }

    const wordBytes = this.index.wordsBuffer.slice(wordStart, wordStart + prefixBytes.length);
    return this.arraysEqual(wordBytes, prefixBytes);
  }

  /**
   * Check if two byte arrays are equal
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get word as string at index
   */
  public getWord(wordIndex: number): string {
    const wordStart = this.index.wordOffsets[wordIndex];
    const wordEnd =
      wordIndex + 1 < this.index.wordOffsets.length
        ? this.index.wordOffsets[wordIndex + 1]
        : this.index.wordsBuffer.length;

    const wordBytes = this.index.wordsBuffer.slice(wordStart, wordEnd);
    return this.decoder.decode(wordBytes);
  }

  /**
   * Case-insensitive search
   * Converts search term to lowercase for comparison
   */
  public findWordCaseInsensitive(searchWord: string): number {
    const lowerWord = searchWord.toLowerCase();

    for (let i = 0; i < this.index.wordOffsets.length; i++) {
      const word = this.getWord(i);
      if (word.toLowerCase() === lowerWord) {
        return i;
      }
    }

    return -1;
  }
}
