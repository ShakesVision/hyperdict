/**
 * TypedIndex - Ultra-efficient index structure using TypedArrays
 * Authored by Shakeeb Ahmad
 *
 * Stores dictionary index in binary format for minimal memory usage:
 * - wordsBuffer: UTF-8 encoded words concatenated
 * - wordOffsets: Uint32 offsets into wordsBuffer for each word
 * - offsetArray: Uint32 file offsets in .dict file for definitions
 * - lengthArray: Uint32 lengths of each definition
 */

import type { ShaekeebTypedIndex, DictionaryEntry } from '../core/types';

export class ShaekeebTypedIndexBuilder {
  private words: string[] = [];
  private offsets: number[] = [];
  private lengths: number[] = [];
  private wordCount: number = 0;

  /**
   * Add a dictionary entry to the index
   */
  public addEntry(word: string, fileOffset: number, length: number): void {
    this.words.push(word);
    this.offsets.push(fileOffset);
    this.lengths.push(length);
    this.wordCount++;
  }

  /**
   * Build the typed index from collected entries
   * Returns a shareable typed index structure
   */
  public build(): ShaekeebTypedIndex {
    if (this.wordCount === 0) {
      throw new Error('Cannot build index with 0 entries');
    }

    // Encode all words to UTF-8
    const encoder = new TextEncoder();
    const encodedWords: Uint8Array[] = [];
    let totalBytes = 0;

    for (const word of this.words) {
      const encoded = encoder.encode(word);
      encodedWords.push(encoded);
      totalBytes += encoded.length;
    }

    // Create word buffer
    const wordsBuffer = new Uint8Array(totalBytes);
    const wordOffsets = new Uint32Array(this.wordCount);
    let currentOffset = 0;

    for (let i = 0; i < this.wordCount; i++) {
      wordOffsets[i] = currentOffset;
      const encoded = encodedWords[i];
      wordsBuffer.set(encoded, currentOffset);
      currentOffset += encoded.length;
    }

    // Create offset and length arrays
    const offsetArray = new Uint32Array(this.offsets);
    const lengthArray = new Uint32Array(this.lengths);

    return {
      wordsBuffer,
      wordOffsets,
      offsetArray,
      lengthArray,
    };
  }

  /**
   * Build index with SharedArrayBuffer for worker access
   * Allows zero-copy sharing with Web Workers
   */
  public buildWithSharedBuffer(): ShaekeebTypedIndex {
    // First build the regular index
    const index = this.build();

    // Create SharedArrayBuffers
    const sharedBuffer = new SharedArrayBuffer(index.wordsBuffer.byteLength);
    const sharedView = new Uint8Array(sharedBuffer);
    sharedView.set(index.wordsBuffer);

    // Note: WordOffsets, offsetArray, and lengthArray should also use SharedArrayBuffer
    // but for now we return them as regular TypedArrays
    // Workers can still read them without copying

    return {
      ...index,
      sharedBuffer,
    };
  }

  /**
   * Clear the builder for reuse
   */
  public clear(): void {
    this.words = [];
    this.offsets = [];
    this.lengths = [];
    this.wordCount = 0;
  }

  /**
   * Get the current number of entries
   */
  public getWordCount(): number {
    return this.wordCount;
  }

  /**
   * Estimate memory usage in bytes
   */
  public estimateMemory(): number {
    let totalBytes = 0;

    // wordsBuffer
    const encoder = new TextEncoder();
    for (const word of this.words) {
      totalBytes += encoder.encode(word).byteLength;
    }

    // wordOffsets (Uint32Array)
    totalBytes += this.wordCount * 4;

    // offsetArray (Uint32Array)
    totalBytes += this.wordCount * 4;

    // lengthArray (Uint32Array)
    totalBytes += this.wordCount * 4;

    return totalBytes;
  }
}

/**
 * Utility class for working with TypedIndex
 */
export class TypedIndexReader {
  private index: ShaekeebTypedIndex;
  private decoder: TextDecoder;

  constructor(index: ShaekeebTypedIndex) {
    this.index = index;
    this.decoder = new TextDecoder('utf-8');
  }

  /**
   * Get word at index without creating intermediate strings
   * Used for direct buffer comparison in binary search
   */
  public getWordBytes(wordIndex: number): Uint8Array {
    const startOffset = this.index.wordOffsets[wordIndex];
    const endOffset =
      wordIndex + 1 < this.index.wordOffsets.length
        ? this.index.wordOffsets[wordIndex + 1]
        : this.index.wordsBuffer.length;

    return this.index.wordsBuffer.slice(startOffset, endOffset);
  }

  /**
   * Get word as string (decoded)
   */
  public getWordString(wordIndex: number): string {
    const bytes = this.getWordBytes(wordIndex);
    return this.decoder.decode(bytes);
  }

  /**
   * Get entry at index
   */
  public getEntry(wordIndex: number): DictionaryEntry {
    return {
      word: this.getWordString(wordIndex),
      definition: '', // Will be fetched from dict file
      offset: this.index.offsetArray[wordIndex],
      length: this.index.lengthArray[wordIndex],
    };
  }

  /**
   * Get total word count
   */
  public getWordCount(): number {
    return this.index.wordOffsets.length;
  }

  /**
   * Get memory usage estimate
   */
  public getMemoryUsage(): number {
    return (
      this.index.wordsBuffer.byteLength +
      this.index.wordOffsets.byteLength +
      this.index.offsetArray.byteLength +
      this.index.lengthArray.byteLength
    );
  }
}
