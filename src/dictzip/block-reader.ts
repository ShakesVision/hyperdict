/**
 * Block Reader - random-access reads from dictzip-compressed content
 * Authored by Shakeeb Ahmad
 *
 * Given an UNCOMPRESSED byte range (offset + length, as stored in the .idx),
 * this reads only the compressed chunk(s) covering that range from a ByteSource,
 * raw-inflates them, and returns the exact slice. Decompressed chunks are kept
 * in a small LRU so repeated/nearby lookups don't refetch.
 *
 * Each dictzip chunk is an independent RAW DEFLATE stream (no per-chunk gzip or
 * zlib wrapper), so it must be inflated with a raw inflate (see rawInflate),
 * NOT a gzip/zlib auto-detecting `decompress`.
 */

import type { DictZipHeader } from '../core/types';
import type { ByteSource } from '../io/byte-source';
import type { ContentReader } from '../dict/content-reader';
import { ShakeebLRUCache } from '../algorithms/lru-cache';

/** Raw-DEFLATE inflate function, injected so the core stays decompressor-agnostic. */
export type RawInflate = (data: Uint8Array) => Uint8Array;

export class ShakeebBlockReader implements ContentReader {
  private source: ByteSource;
  private header: DictZipHeader;
  private cache: ShakeebLRUCache;
  private inflate: RawInflate;
  /** In-flight chunk fetches, so concurrent reads of one chunk share the work. */
  private inflight: Map<number, Promise<Uint8Array>> = new Map();

  constructor(
    source: ByteSource,
    header: DictZipHeader,
    inflate: RawInflate,
    cacheSize: number = 32
  ) {
    this.source = source;
    this.header = header;
    this.cache = new ShakeebLRUCache(cacheSize);
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
    // Coalesce concurrent reads of the same chunk into one fetch + inflate.
    const pending = this.inflight.get(chunkIndex);
    if (pending) {
      return pending;
    }

    const start = this.header.cumOffsets[chunkIndex];
    const end = start + this.header.chunkCompLengths[chunkIndex];
    const promise = this.source
      .read(start, end)
      .then((compressed) => {
        const decompressed = this.inflate(compressed);
        this.cache.set(chunkIndex, decompressed);
        return decompressed;
      })
      .finally(() => {
        this.inflight.delete(chunkIndex);
      });

    this.inflight.set(chunkIndex, promise);
    return promise;
  }

  /** Warm the cache for chunks following `currentChunk` (sequential reading aid). */
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
