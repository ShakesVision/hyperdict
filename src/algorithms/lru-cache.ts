/**
 * LRU Cache - Least Recently Used block cache
 * Authored by Shakeeb Ahmad
 *
 * Caches decompressed dictzip blocks to avoid repeated decompression
 * Default: 32 blocks (~2MB memory)
 */

import type { CachedBlock } from '../core/types';

export class ShakeebLRUCache {
  private cache: Map<number, CachedBlock>;
  private maxSize: number;
  private accessOrder: number[] = []; // Track access order for LRU

  constructor(maxSize: number = 32) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Get cached block
   * Returns null if not found
   * Updates access time on hit
   */
  public get(blockIndex: number): Uint8Array | null {
    const block = this.cache.get(blockIndex);

    if (!block) {
      return null;
    }

    // Update access order
    block.timestamp = Date.now();
    this.updateAccessOrder(blockIndex);

    return block.data;
  }

  /**
   * Set cached block
   * Evicts LRU item if cache is full
   */
  public set(blockIndex: number, data: Uint8Array): void {
    // If block already exists, just update it
    if (this.cache.has(blockIndex)) {
      const block = this.cache.get(blockIndex)!;
      block.data = data;
      block.timestamp = Date.now();
      this.updateAccessOrder(blockIndex);
      return;
    }

    // Evict LRU if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // Add new block
    this.cache.set(blockIndex, {
      blockIndex,
      data,
      timestamp: Date.now(),
    });

    this.accessOrder.push(blockIndex);
  }

  /**
   * Evict least recently used block
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    // Find the LRU item
    let lruIndex = 0;
    let lruTime = Infinity;

    for (let i = 0; i < this.accessOrder.length; i++) {
      const blockIdx = this.accessOrder[i];
      const block = this.cache.get(blockIdx);

      if (block && block.timestamp < lruTime) {
        lruTime = block.timestamp;
        lruIndex = i;
      }
    }

    const blockIndex = this.accessOrder[lruIndex];
    this.cache.delete(blockIndex);
    this.accessOrder.splice(lruIndex, 1);
  }

  /**
   * Update access order when block is accessed
   */
  private updateAccessOrder(blockIndex: number): void {
    const index = this.accessOrder.indexOf(blockIndex);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(blockIndex);
  }

  /**
   * Clear all cached blocks
   */
  public clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    memoryUsage: number;
  } {
    let memoryUsage = 0;

    for (const block of this.cache.values()) {
      memoryUsage += block.data.byteLength;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need to track hits separately
      memoryUsage,
    };
  }

  /**
   * Check if block is cached
   */
  public has(blockIndex: number): boolean {
    return this.cache.has(blockIndex);
  }

  /**
   * Get cache size
   */
  public getSize(): number {
    return this.cache.size;
  }
}
