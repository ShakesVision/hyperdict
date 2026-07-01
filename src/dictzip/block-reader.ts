/**
 * Block Reader - Random-access reads from a dictzip (.dict.dz) file
 * Authored by Shakeeb Ahmad
 *
 * Given an UNCOMPRESSED byte range (offset + length, as stored in the .idx),
 * this fetches only the compressed chunk(s) covering that range over HTTP Range
 * requests, raw-inflates them, and returns the exact slice. Decompressed chunks
 * are kept in a small LRU so repeated/nearby lookups don't refetch.
 *
 * Each dictzip chunk is an independent RAW DEFLATE stream (no per-chunk gzip or
 * zlib wrapper), so it must be inflated with a raw inflate (fflate.inflateSync),
 * NOT a gzip/zlib auto-detecting `decompress`.
 */

import type { DictZipHeader } from '../core/types';
import { ShaekeebRangeFetcher } from '../io/range-fetch';
import { ShaekeebLRUCache } from '../algorithms/lru-cache';

/** Raw-DEFLATE inflate function, injected so the core stays decompressor-agnostic. */
export type RawInflate = (data: Uint8Array) => Uint8Array;

export class ShaekeebBlockReader {
  private fetcher: ShaekeebRangeFetcher;
  private header: DictZipHeader;
  private cache: ShaekeebLRUCache;
  private inflate: RawInflate;

  constructor(
    dictUrl: string,
    header: DictZipHeader,
    inflate: RawInflate,
    cacheSize: number = 32
  ) {
    this.fetcher = new ShaekeebRangeFetcher(dictUrl);
    this.header = header;
    this.cache = new ShaekeebLRUCache(cacheSize);
    this.inflate = inflate;
  }

  /**
   * Read `length` uncompressed bytes starting at uncompressed `offset`.
   * Transparently spans chunk boundaries (a definition can straddle two chunks).
   */
  public async readBytes(offset: number, length: number): Promise<Uint8Array> {
    if (length <= 0) {
      return new Uint8Array(0);
    }

    const result = new Uint8Array(length);
    let written = 0;
    let cursor = offset;
    let remaining = length;

    while (remaining > 0) {
      const chunkIndex = Math.floor(cursor / this.header.chunkLength);
      if (chunkIndex < 0 || chunkIndex >= this.header.chunkCount) {
        throw new Error(`Uncompressed offset ${cursor} is out of range`);
      }

      const chunk = await this.getChunk(chunkIndex);

      const chunkStart = chunkIndex * this.header.chunkLength;
      const offsetInChunk = cursor - chunkStart;
      if (offsetInChunk >= chunk.length) {
        // Requested bytes lie beyond the data this chunk actually decoded to.
        throw new Error(
          `Offset ${cursor} beyond chunk ${chunkIndex} (chunk decoded ${chunk.length} bytes)`
        );
      }

      const available = chunk.length - offsetInChunk;
      const take = Math.min(remaining, available);

      result.set(chunk.subarray(offsetInChunk, offsetInChunk + take), written);

      written += take;
      cursor += take;
      remaining -= take;
    }

    return result;
  }

  /** Get a decompressed chunk, from the LRU cache or by fetch + raw inflate. */
  private async getChunk(chunkIndex: number): Promise<Uint8Array> {
    const cached = this.cache.get(chunkIndex);
    if (cached) {
      return cached;
    }

    const range = this.compressedRange(chunkIndex);
    const compressed = await this.fetcher.fetchRange(range.start, range.end);
    const decompressed = this.inflate(compressed);

    this.cache.set(chunkIndex, decompressed);
    return decompressed;
  }

  /** Absolute compressed [start, end) of a chunk. */
  private compressedRange(chunkIndex: number): { start: number; end: number } {
    const start = this.header.cumOffsets[chunkIndex];
    const end = start + this.header.chunkCompLengths[chunkIndex];
    return { start, end };
  }

  /**
   * Warm the cache for chunks following `currentChunk` (sequential reading aid).
   */
  public async prefetchNextChunks(currentChunk: number, count: number = 2): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (let i = 1; i <= count; i++) {
      const idx = currentChunk + i;
      if (idx < this.header.chunkCount && !this.cache.has(idx)) {
        promises.push(this.getChunk(idx));
      }
    }
    await Promise.all(promises);
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getStats(): {
    chunkCount: number;
    chunkLength: number;
    cacheSize: number;
    cacheMemory: number;
  } {
    const stats = this.cache.getStats();
    return {
      chunkCount: this.header.chunkCount,
      chunkLength: this.header.chunkLength,
      cacheSize: stats.size,
      cacheMemory: stats.memoryUsage,
    };
  }
}
