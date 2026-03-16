/**
 * LRU Cache Tests
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaekeebLRUCache } from '../src/algorithms/lru-cache';

describe('ShaekeebLRUCache', () => {
  let cache: ShaekeebLRUCache;

  beforeEach(() => {
    cache = new ShaekeebLRUCache(3); // Small cache for testing
  });

  it('should add and retrieve items', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    cache.set(0, data);

    const retrieved = cache.get(0);
    expect(retrieved).toEqual(data);
  });

  it('should return null for non-existent items', () => {
    const result = cache.get(999);
    expect(result).toBeNull();
  });

  it('should check if item exists', () => {
    const data = new Uint8Array([1, 2, 3]);
    cache.set(1, data);

    expect(cache.has(1)).toBe(true);
    expect(cache.has(999)).toBe(false);
  });

  it('should evict LRU item when cache is full', () => {
    const data1 = new Uint8Array([1]);
    const data2 = new Uint8Array([2]);
    const data3 = new Uint8Array([3]);
    const data4 = new Uint8Array([4]);

    cache.set(0, data1);
    cache.set(1, data2);
    cache.set(2, data3);

    // Cache is full, size should be 3
    expect(cache.getSize()).toBe(3);

    // Add another item, should evict the LRU (0)
    cache.set(3, data4);

    expect(cache.getSize()).toBe(3);
    expect(cache.has(0)).toBe(false); // LRU evicted
    expect(cache.has(3)).toBe(true);
  });

  it('should update access order on get', () => {
    const data1 = new Uint8Array([1]);
    const data2 = new Uint8Array([2]);
    const data3 = new Uint8Array([3]);
    const data4 = new Uint8Array([4]);

    cache.set(0, data1);
    cache.set(1, data2);
    cache.set(2, data3);

    // Access item 0, making it recently used
    cache.get(0);

    // Add new item, should evict 1 (now LRU)
    cache.set(3, data4);

    expect(cache.has(0)).toBe(true); // Recently accessed, not evicted
    expect(cache.has(1)).toBe(false); // Evicted
    expect(cache.has(3)).toBe(true);
  });

  it('should update existing item', () => {
    const data1 = new Uint8Array([1, 1, 1]);
    const data2 = new Uint8Array([2, 2, 2]);

    cache.set(0, data1);
    const retrieved1 = cache.get(0);
    expect(retrieved1).toEqual(data1);

    cache.set(0, data2);
    const retrieved2 = cache.get(0);
    expect(retrieved2).toEqual(data2);
  });

  it('should report statistics', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    cache.set(0, data);
    cache.set(1, data);

    const stats = cache.getStats();

    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('maxSize');
    expect(stats).toHaveProperty('memoryUsage');
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(3);
    expect(stats.memoryUsage).toBeGreaterThan(0);
  });

  it('should clear all items', () => {
    const data = new Uint8Array([1, 2, 3]);
    cache.set(0, data);
    cache.set(1, data);
    cache.set(2, data);

    expect(cache.getSize()).toBe(3);

    cache.clear();

    expect(cache.getSize()).toBe(0);
    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(false);
    expect(cache.has(2)).toBe(false);
  });

  it('should handle large cache', () => {
    const largeCache = new ShaekeebLRUCache(1000);
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    // Add 1000 items
    for (let i = 0; i < 1000; i++) {
      largeCache.set(i, data);
    }

    expect(largeCache.getSize()).toBe(1000);

    // Add one more, should evict LRU
    largeCache.set(1000, data);
    expect(largeCache.getSize()).toBe(1000);
    expect(largeCache.has(0)).toBe(false); // First item evicted
    expect(largeCache.has(1000)).toBe(true);
  });

  it('should estimate memory usage correctly', () => {
    const data1 = new Uint8Array(1024); // 1KB
    const data2 = new Uint8Array(2048); // 2KB

    cache.set(0, data1);
    cache.set(1, data2);

    const stats = cache.getStats();
    expect(stats.memoryUsage).toBeGreaterThanOrEqual(3072); // At least 3KB
  });
});
