/**
 * Basic smoke tests for HyperDict core components
 * Authored by Shakeeb Ahmad
 *
 * Tests individual components to ensure they work correctly
 */

import { describe, it, expect } from 'vitest';
import { ShaekeebTypedIndexBuilder, TypedIndexReader } from '../src/index/typed-index';
import { ShaekeebBinarySearch } from '../src/algorithms/binary-search';
import { ShaekeebPrefixIndex } from '../src/algorithms/prefix-index';
import { ShaekeebBloomFilter } from '../src/algorithms/bloom-filter';
import { ShaekeebLRUCache } from '../src/algorithms/lru-cache';

describe('TypedIndex', () => {
  it('should build index with entries', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('apple', 100, 50);
    builder.addEntry('banana', 200, 60);
    builder.addEntry('cherry', 300, 45);

    const index = builder.build();

    expect(index.wordOffsets.length).toBe(3);
    expect(index.offsetArray[0]).toBe(100);
    expect(index.offsetArray[1]).toBe(200);
    expect(index.offsetArray[2]).toBe(300);
  });

  it('should read words correctly', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('hello', 0, 10);
    builder.addEntry('world', 10, 10);

    const index = builder.build();
    const reader = new TypedIndexReader(index);

    expect(reader.getWordString(0)).toBe('hello');
    expect(reader.getWordString(1)).toBe('world');
  });

  it('should estimate memory usage', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('test1', 0, 10);
    builder.addEntry('test2', 10, 10);

    const memory = builder.estimateMemory();
    expect(memory).toBeGreaterThan(0);
  });
});

describe('Binary Search', () => {
  it('should find exact match', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('apple', 0, 10);
    builder.addEntry('banana', 10, 10);
    builder.addEntry('cherry', 20, 10);

    const index = builder.build();
    const search = new ShaekeebBinarySearch(index);

    expect(search.findWord('apple')).toBe(0);
    expect(search.findWord('banana')).toBe(1);
    expect(search.findWord('cherry')).toBe(2);
  });

  it('should return -1 for non-existent word', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('apple', 0, 10);
    builder.addEntry('banana', 10, 10);

    const index = builder.build();
    const search = new ShaekeebBinarySearch(index);

    expect(search.findWord('grape')).toBe(-1);
  });

  it('should support case-insensitive search', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('Apple', 0, 10);
    builder.addEntry('Banana', 10, 10);

    const index = builder.build();
    const search = new ShaekeebBinarySearch(index);

    expect(search.findWordCaseInsensitive('apple')).toBe(0);
    expect(search.findWordCaseInsensitive('APPLE')).toBe(0);
  });
});

describe('Bloom Filter', () => {
  it('should add and check items', () => {
    const filter = new ShaekeebBloomFilter(100, 0.01);

    filter.add('apple');
    filter.add('banana');

    expect(filter.mightContain('apple')).toBe(true);
    expect(filter.mightContain('banana')).toBe(true);
  });

  it('should have low false positive rate', () => {
    const filter = new ShaekeebBloomFilter(1000, 0.01);

    // Add words
    for (let i = 0; i < 100; i++) {
      filter.add(`word${i}`);
    }

    // Check for non-existent words
    let falsePositives = 0;
    for (let i = 100; i < 200; i++) {
      if (filter.mightContain(`word${i}`)) {
        falsePositives++;
      }
    }

    // Should have low false positive rate (less than 10%)
    expect(falsePositives / 100).toBeLessThan(0.1);
  });

  it('should support serialization', () => {
    const filter = new ShaekeebBloomFilter(100, 0.01);
    filter.add('test1');
    filter.add('test2');

    const serialized = filter.toBase64();
    const restored = ShaekeebBloomFilter.fromBase64(serialized);

    expect(restored.mightContain('test1')).toBe(true);
    expect(restored.mightContain('test2')).toBe(true);
  });
});

describe('Prefix Index', () => {
  it('should create prefix index', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('apple', 0, 10);
    builder.addEntry('apricot', 10, 10);
    builder.addEntry('banana', 20, 10);

    const index = builder.build();
    const prefixIndex = new ShaekeebPrefixIndex(index);

    const stats = prefixIndex.getStats();
    expect(stats.totalWords).toBe(3);
    expect(stats.totalPrefixes).toBeGreaterThan(0);
  });

  it('should get search range', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    builder.addEntry('apple', 0, 10);
    builder.addEntry('apricot', 10, 10);
    builder.addEntry('banana', 20, 10);

    const index = builder.build();
    const prefixIndex = new ShaekeebPrefixIndex(index);

    const range = prefixIndex.getSearchRange('apple');
    expect(range).not.toBeNull();
  });
});

describe('LRU Cache', () => {
  it('should cache items', () => {
    const cache = new ShaekeebLRUCache(3);

    const data1 = new Uint8Array([1, 2, 3]);
    cache.set(1, data1);

    const retrieved = cache.get(1);
    expect(retrieved).toEqual(data1);
  });

  it('should evict LRU item when full', () => {
    const cache = new ShaekeebLRUCache(2);

    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([4, 5, 6]);
    const data3 = new Uint8Array([7, 8, 9]);

    cache.set(1, data1);
    cache.set(2, data2);
    cache.set(3, data3); // Should evict item 1

    expect(cache.has(1)).toBe(false);
    expect(cache.has(2)).toBe(true);
    expect(cache.has(3)).toBe(true);
  });

  it('should track cache statistics', () => {
    const cache = new ShaekeebLRUCache(5);

    cache.set(1, new Uint8Array([1, 2, 3]));
    cache.set(2, new Uint8Array([4, 5, 6]));

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(5);
  });
});
