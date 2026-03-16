/**
 * Block Reader - Read and decompress dictzip blocks
 * Authored by Shakeeb Ahmad
 *
 * Handles:
 * - Fetching compressed blocks
 * - Decompressing using fflate
 * - Extracting requested bytes from decompressed content
 */

import type { DictZipHeader } from '../core/types';
import { ShaekeebRangeFetcher } from '../io/range-fetch';
import { ShaekeebLRUCache } from '../algorithms/lru-cache';

/**
 * Fflate decompression function type
 * Must be injected from browser environment
 */
declare type FflateDecompressSync = (data: Uint8Array) => Uint8Array;

export class ShaekeebBlockReader {
  private fetcher: ShaekeebRangeFetcher;
  private header: DictZipHeader;
  private cache: ShaekeebLRUCache;
  private decompressor: FflateDecompressSync;

  constructor(
    dictUrl: string,
    header: DictZipHeader,
    decompressor: FflateDecompressSync,
    cacheSize: number = 32
  ) {
    this.fetcher = new ShaekeebRangeFetcher(dictUrl);
    this.header = header;
    this.cache = new ShaekeebLRUCache(cacheSize);
    this.decompressor = decompressor;
  }

  /**
   * Read and decompress bytes from given offset
   * Handles block boundaries automatically
   */
  public async readBytes(offset: number, length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    let resultOffset = 0;
    let currentOffset = offset;
    let remainingBytes = length;

    while (remainingBytes > 0) {
      // Find block containing this offset
      const blockIndex = this.findBlockForOffset(currentOffset);
      if (blockIndex === -1) {
        throw new Error(`Offset ${currentOffset} out of range`);
      }

      // Get decompressed block
      const blockData = await this.getDecompressedBlock(blockIndex);

      // Calculate position within block
      const blockStart = blockIndex * this.header.blockSize;
      const offsetInBlock = currentOffset - blockStart;

      // Calculate how many bytes to read from this block
      const availableInBlock = blockData.length - offsetInBlock;
      const bytesToRead = Math.min(remainingBytes, availableInBlock);

      // Copy bytes to result
      result.set(blockData.slice(offsetInBlock, offsetInBlock + bytesToRead), resultOffset);

      resultOffset += bytesToRead;
      currentOffset += bytesToRead;
      remainingBytes -= bytesToRead;
    }

    return result;
  }

  /**
   * Get decompressed block (from cache or fetch + decompress)
   */
  private async getDecompressedBlock(blockIndex: number): Promise<Uint8Array> {
    // Check cache first
    const cached = this.cache.get(blockIndex);
    if (cached) {
      return cached;
    }

    // Fetch and decompress
    const compressedBlock = await this.fetchBlock(blockIndex);
    const decompressed = this.decompressor(compressedBlock);

    // Cache result
    this.cache.set(blockIndex, decompressed);

    return decompressed;
  }

  /**
   * Fetch compressed block from file
   */
  private async fetchBlock(blockIndex: number): Promise<Uint8Array> {
    if (blockIndex < 0 || blockIndex >= this.header.blockOffsets.length) {
      throw new Error(`Block index ${blockIndex} out of range`);
    }

    const blockStart = this.header.blockOffsets[blockIndex];
    const blockEnd =
      blockIndex + 1 < this.header.blockOffsets.length
        ? this.header.blockOffsets[blockIndex + 1]
        : Number.MAX_SAFE_INTEGER;

    return this.fetcher.fetchRange(blockStart, blockEnd);
  }

  /**
   * Find block containing offset in decompressed stream
   */
  private findBlockForOffset(offset: number): number {
    const blockIndex = Math.floor(offset / this.header.blockSize);

    if (blockIndex < 0 || blockIndex >= this.header.blockOffsets.length) {
      return -1;
    }

    return blockIndex;
  }

  /**
   * Prefetch next blocks for sequential reading
   */
  public async prefetchNextBlocks(currentBlock: number, count: number = 3): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 1; i <= count; i++) {
      const blockIndex = currentBlock + i;

      if (blockIndex < this.header.blockOffsets.length && !this.cache.has(blockIndex)) {
        promises.push(this.getDecompressedBlock(blockIndex).then(() => undefined));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get statistics
   */
  public getStats(): {
    blockCount: number;
    blockSize: number;
    cacheSize: number;
    cacheMemory: number;
  } {
    const stats = this.cache.getStats();

    return {
      blockCount: this.header.blockOffsets.length,
      blockSize: this.header.blockSize,
      cacheSize: stats.size,
      cacheMemory: stats.memoryUsage,
    };
  }
}
